import { useRef, useEffect } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';

export default function Player({ 
  tracks, 
  clips, 
  playhead, 
  setPlayhead, 
  isPlaying, 
  setIsPlaying,
  zoom
}) {
  const canvasRef = useRef(null);
  const videoRefs = useRef({});
  const audioRefs = useRef({});
  const animationFrameId = useRef(null);
  const lastTimeRef = useRef(0);
  const currentPlayheadRef = useRef(playhead);
  const ignorePlayheadSyncRef = useRef(false);
  const scale = zoom;

  // Get unique video and audio files from clips to avoid duplicating DOM media elements
  const uniqueVideoFiles = [];
  const uniqueAudioFiles = [];
  clips.forEach(c => {
    if (c.type === 'video') {
      if (!uniqueVideoFiles.includes(c.filePath)) {
        uniqueVideoFiles.push(c.filePath);
      }
    } else {
      if (!uniqueAudioFiles.includes(c.filePath)) {
        uniqueAudioFiles.push(c.filePath);
      }
    }
  });

  // Compute total timeline duration based on max end time of all clips
  const totalDuration = clips.length > 0
    ? Math.max(...clips.map(c => c.timelineStart + (c.end - c.start)))
    : 0;

  // Sync internal ref with parent state when paused or seeking
  useEffect(() => {
    if (ignorePlayheadSyncRef.current) {
      ignorePlayheadSyncRef.current = false;
      return;
    }
    currentPlayheadRef.current = playhead;
  }, [playhead, isPlaying]);

  // Find active video clip at a given timeline time (highest layer/track wins)
  const getActiveVideoClip = (time) => {
    for (let i = tracks.length - 1; i >= 0; i--) {
      const track = tracks[i];
      if (track.type === 'video' && track.visible !== false) {
        const trackClips = clips.filter(c => c.trackId === track.id);
        for (const clip of trackClips) {
          const duration = clip.end - clip.start;
          // Apply a small tolerance (0.01s) to prevent float precision gaps at clip boundaries
          if (time >= clip.timelineStart - 0.01 && time <= clip.timelineStart + duration + 0.01) {
            return { clip, timelineStart: clip.timelineStart };
          }
        }
      }
    }
    return null;
  };

  // Sync elements when paused or seeking
  useEffect(() => {
    if (!isPlaying) {
      // Pause all media elements
      Object.values(videoRefs.current).forEach(v => { 
        if (v) {
          v.pause(); 
          v.playRequested = false;
          v.timeSynced = false;
        }
      });
      Object.values(audioRefs.current).forEach(a => { 
        if (a) {
          a.pause(); 
          a.playRequested = false;
        }
      });

      // Seek active video to sync preview frame
      const active = getActiveVideoClip(playhead);
      if (active) {
        const { clip, timelineStart } = active;
        const videoEl = videoRefs.current[clip.filePath];
        if (videoEl) {
          const rawTarget = (playhead - timelineStart) + clip.start;
          const maxDuration = videoEl.duration || clip.sourceDuration || 999999;
          const clampedTarget = Math.max(0, Math.min(maxDuration, rawTarget));
          const track = tracks.find(t => t.id === clip.trackId);
          const isMuted = track ? track.muted : false;
          videoEl.volume = isMuted ? 0 : (clip.volume ?? 1);
          videoEl.muted = isMuted || (clip.volume ?? 1) === 0;
          
          if (!isNaN(clampedTarget)) {
            // Only seek if difference is noticeable (1ms) to prevent spamming
            if (Math.abs(videoEl.currentTime - clampedTarget) > 0.001) {
              videoEl.currentTime = clampedTarget;
            }
          }
          drawFrame(videoEl);
        }
      } else {
        clearCanvas();
      }
    }
  }, [playhead, isPlaying, clips, tracks]);

  // Clean up animation frames
  useEffect(() => {
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  // Main playback sync loop
  useEffect(() => {
    if (isPlaying) {
      if (window.api && window.api.log) {
        window.api.log(`Playback START: playhead prop=${playhead}, ref=${currentPlayheadRef.current}`);
      }
      lastTimeRef.current = performance.now();
      let lastStateUpdate = performance.now();
      let lastStatusLog = 0;

      const loop = () => {
        const now = performance.now();
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;

        // 1. Find the active video clip based on current playhead
        const activeVideo = getActiveVideoClip(currentPlayheadRef.current);
        let nextPlayhead = currentPlayheadRef.current;

        if (activeVideo) {
          const { clip, timelineStart } = activeVideo;
          const videoEl = videoRefs.current[clip.filePath];
          
          if (videoEl) {
            // Ensure the master video element is playing
            if (videoEl.paused && !videoEl.playRequested && !videoEl.seeking) {
              videoEl.playRequested = true;
              videoEl.timeSynced = false;
              const targetTime = (currentPlayheadRef.current - timelineStart) + clip.start;
              const maxDuration = videoEl.duration || clip.sourceDuration || 999999;
              const clampedTarget = Math.max(0, Math.min(maxDuration, targetTime));
              
              if (window.api && window.api.log) {
                window.api.log(`Master Video play check: targetTime=${targetTime}, clampedTarget=${clampedTarget}, videoEl.currentTime=${videoEl.currentTime}`);
              }

              const track = tracks.find(t => t.id === clip.trackId);
              const isMuted = track ? track.muted : false;
              videoEl.volume = isMuted ? 0 : (clip.volume ?? 1);
              videoEl.muted = isMuted || (clip.volume ?? 1) === 0;

              // Seek to target position
              if (Math.abs(videoEl.currentTime - clampedTarget) > 0.1) {
                if (window.api && window.api.log) {
                  window.api.log(`Master Video SEEK to clampedTarget=${clampedTarget}`);
                }
                videoEl.currentTime = clampedTarget;
              }

              // Start playback immediately. If the seek is lost (Chromium race),
              // drift correction below will re-seek while playing.
              videoEl.play()
                .then(() => { 
                  videoEl.playRequested = false;
                  if (window.api && window.api.log) {
                    window.api.log(`Master Video play RESOLVED. currentTime=${videoEl.currentTime}`);
                  }
                })
                .catch(e => { 
                  videoEl.playRequested = false; 
                  console.error('Video play error:', e); 
                  if (window.api && window.api.log) {
                    window.api.log(`Master Video play REJECTED: ${e.message}`);
                  }
                });
            } else if (!videoEl.paused && !videoEl.seeking) {
              // Apply volume/mute dynamically during playback
              const track = tracks.find(t => t.id === clip.trackId);
              const isMuted = track ? track.muted : false;
              videoEl.volume = isMuted ? 0 : (clip.volume ?? 1);
              videoEl.muted = isMuted || (clip.volume ?? 1) === 0;
            }

            // Drive playhead from the video element's actual position (zero drift master).
            // Don't trust videoEl.currentTime until we confirm the video is at the expected position.
            if (!videoEl.paused && !videoEl.seeking && !videoEl.playRequested) {
              const expectedTime = (currentPlayheadRef.current - timelineStart) + clip.start;
              const actualTime = videoEl.currentTime;
              const positionError = Math.abs(actualTime - expectedTime);

              if (!videoEl.timeSynced) {
                // Waiting for video to arrive at the expected position
                if (positionError < 0.5) {
                  // Video is close enough — trust it now
                  videoEl.timeSynced = true;
                  nextPlayhead = actualTime - clip.start + timelineStart;
                } else {
                  // Video is far from expected position (seek was lost), re-seek while playing
                  if (window.api && window.api.log) {
                    window.api.log(`Master Video RE-SEEK: expected=${expectedTime.toFixed(3)}, actual=${actualTime.toFixed(3)}`);
                  }
                  videoEl.currentTime = expectedTime;
                  nextPlayhead = currentPlayheadRef.current + delta;
                }
              } else {
                // Normal playback: drive playhead from video, with drift correction
                if (positionError > 0.5) {
                  if (window.api && window.api.log) {
                    window.api.log(`Master Video DRIFT correction: expected=${expectedTime.toFixed(3)}, actual=${actualTime.toFixed(3)}`);
                  }
                  videoEl.currentTime = expectedTime;
                  nextPlayhead = currentPlayheadRef.current + delta;
                } else {
                  nextPlayhead = actualTime - clip.start + timelineStart;
                }
              }
            } else {
              // Video is paused, seeking, or play pending — advance via system clock
              nextPlayhead = currentPlayheadRef.current + delta;
            }

            // Periodic status logging (every 1s) for diagnostics
            if (now - lastStatusLog > 1000) {
              lastStatusLog = now;
              if (window.api && window.api.log) {
                window.api.log(`[LOOP STATUS] paused=${videoEl.paused}, seeking=${videoEl.seeking}, playReq=${videoEl.playRequested}, timeSynced=${videoEl.timeSynced}, readyState=${videoEl.readyState}, videoTime=${videoEl.currentTime.toFixed(3)}, playhead=${currentPlayheadRef.current.toFixed(3)}, videoSize=${videoEl.videoWidth}x${videoEl.videoHeight}`);
              }
            }

            // Render current frame to canvas
            drawFrame(videoEl);
          } else {
            nextPlayhead = currentPlayheadRef.current + delta;
          }
        } else {
          // No active video, advance playhead via system clock
          nextPlayhead = currentPlayheadRef.current + delta;
          clearCanvas();
        }

        // Clip the playhead to the total duration
        if (nextPlayhead >= totalDuration) {
          if (window.api && window.api.log) {
            window.api.log(`Playback loop ended: nextPlayhead=${nextPlayhead} >= totalDuration=${totalDuration}`);
          }
          setIsPlaying(false);
          setPlayhead(0);
          currentPlayheadRef.current = 0;
          Object.values(videoRefs.current).forEach(v => { if (v) v.pause(); });
          Object.values(audioRefs.current).forEach(a => { if (a) a.pause(); });
          return;
        }

        currentPlayheadRef.current = nextPlayhead;

        // 2. Sync all other video and audio elements (non-masters) to nextPlayhead
        clips.forEach(clip => {
          const duration = clip.end - clip.start;
          const isActive = nextPlayhead >= clip.timelineStart && nextPlayhead < clip.timelineStart + duration;
          
          // Skip if this is the master visual clip
          if (activeVideo && activeVideo.clip.id === clip.id) return;

          const track = tracks.find(t => t.id === clip.trackId);
          const shouldPlay = isActive && track && !track.muted && (clip.volume ?? 1) > 0;
          
          const mediaEl = clip.type === 'video' ? videoRefs.current[clip.filePath] : audioRefs.current[clip.filePath];
          if (!mediaEl) return;

          if (shouldPlay) {
            mediaEl.volume = clip.volume ?? 1;
            mediaEl.muted = (clip.volume ?? 1) === 0;

            if (mediaEl.paused && !mediaEl.playRequested && !mediaEl.seeking) {
              mediaEl.playRequested = true;
              const targetTime = (nextPlayhead - clip.timelineStart) + clip.start;
              const maxDuration = mediaEl.duration || clip.sourceDuration || 999999;
              const clampedTarget = Math.max(0, Math.min(maxDuration, targetTime));
              
              if (Math.abs(mediaEl.currentTime - clampedTarget) > 0.1) {
                mediaEl.currentTime = clampedTarget;
              }
              
              mediaEl.play()
                .then(() => { mediaEl.playRequested = false; })
                .catch(e => { mediaEl.playRequested = false; console.error('Media sync play error:', e); });
            } else if (!mediaEl.paused && !mediaEl.seeking) {
              const targetTime = (nextPlayhead - clip.timelineStart) + clip.start;
              const drift = mediaEl.currentTime - targetTime;
              if (Math.abs(drift) > 0.25) { // Resync background media if drift exceeds 250ms
                const maxDuration = mediaEl.duration || clip.sourceDuration || 999999;
                mediaEl.currentTime = Math.max(0, Math.min(maxDuration, targetTime));
              }
            }
          } else {
            mediaEl.pause();
            mediaEl.playRequested = false;
          }
        });

        // 3. Pause any unique video elements not used at all in this frame
        uniqueVideoFiles.forEach(fp => {
          if (activeVideo && activeVideo.clip.filePath === fp) return;
          const isUsed = clips.some(clip => {
            if (clip.filePath !== fp) return false;
            const duration = clip.end - clip.start;
            const isActive = nextPlayhead >= clip.timelineStart && nextPlayhead < clip.timelineStart + duration;
            const track = tracks.find(t => t.id === clip.trackId);
            return isActive && track && !track.muted && (clip.volume ?? 1) > 0;
          });
          if (!isUsed) {
            const el = videoRefs.current[fp];
            if (el && !el.paused) {
              el.pause();
              el.playRequested = false;
            }
          }
        });

        // 4. Update playhead position directly in DOM for high performance
        const playheadEl = document.querySelector('.timeline-playhead');
        if (playheadEl) {
          playheadEl.style.left = `${nextPlayhead * scale + 160}px`;
        }

        const timecodeEl = document.querySelector('.timecode');
        if (timecodeEl) {
          timecodeEl.textContent = `${formatTimecode(nextPlayhead)} / ${formatTimecode(totalDuration)}`;
        }

        // Throttled parent state updates
        if (now - lastStateUpdate > 100) {
          ignorePlayheadSyncRef.current = true;
          setPlayhead(nextPlayhead);
          lastStateUpdate = now;
        }

        animationFrameId.current = requestAnimationFrame(loop);
      };

      animationFrameId.current = requestAnimationFrame(loop);
    } else {
      if (window.api && window.api.log) {
        window.api.log(`Playback STOP (Pause): ref=${currentPlayheadRef.current}`);
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      setPlayhead(currentPlayheadRef.current);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, clips, tracks, totalDuration, scale]);

  // Canvas drawing utilities
  function drawFrame(videoEl) {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) {
      if (window.api && window.api.log && !drawFrame._noElWarn) {
        drawFrame._noElWarn = true;
        window.api.log(`[drawFrame] SKIP: canvas=${!!canvas}, videoEl=${!!videoEl}`);
      }
      return;
    }
    
    // Log readyState changes for diagnostics
    if (videoEl.readyState !== drawFrame._lastReadyState) {
      drawFrame._lastReadyState = videoEl.readyState;
      if (window.api && window.api.log) {
        window.api.log(`[drawFrame] readyState changed to ${videoEl.readyState} (paused=${videoEl.paused}, seeking=${videoEl.seeking}, time=${videoEl.currentTime.toFixed(3)})`);
      }
    }
    
    // Skip drawing only if no data at all (readyState 0 = HAVE_NOTHING).
    // readyState 1+ means at least metadata is available; the browser can
    // often still paint the last decoded frame even during seeks.
    if (videoEl.readyState < 1) {
      return;
    }
    
    const ctx = canvas.getContext('2d');
    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 360;
    
    // Set canvas dimensions to match video aspect ratio if necessary
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
    
    try {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      if (window.api && window.api.log) {
        window.api.log(`[drawFrame] ERROR: ${e.message}`);
      }
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Skip back to start
  const handleRewind = () => {
    setIsPlaying(false);
    setPlayhead(0);
  };

  // Convert seconds to HH:MM:SS
  function formatTimecode(sec) {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  return (
    <div className="panel player-panel">
      <div className="panel-header">
        미리보기 (Preview Player)
      </div>

      <div className="player-container">
        {/* Visual Canvas screen */}
        <div className="canvas-wrapper">
          <canvas ref={canvasRef} className="player-canvas" />
        </div>

        {/* Hidden video and audio elements (Mapped strictly to unique file paths) */}
        <div style={{ display: 'none' }}>
          {uniqueVideoFiles.map(filePath => (
            <video 
              key={filePath}
              ref={el => videoRefs.current[filePath] = el}
              src={`media://${filePath}`}
              preload="auto"
              crossOrigin="anonymous"
              onSeeked={(e) => {
                const active = getActiveVideoClip(playhead);
                if (active && active.clip.filePath === filePath) {
                  drawFrame(e.target);
                }
              }}
              onLoadedData={() => {
                const active = getActiveVideoClip(playhead);
                if (active && active.clip.filePath === filePath) {
                  const videoEl = videoRefs.current[filePath];
                  if (videoEl) drawFrame(videoEl);
                }
              }}
            />
          ))}
          {uniqueAudioFiles.map(filePath => (
            <audio 
              key={filePath}
              ref={el => audioRefs.current[filePath] = el}
              src={`media://${filePath}`}
              preload="auto"
            />
          ))}
        </div>

        {/* Playback Controls */}
        <div className="player-controls">
          <div className="timecode">
            {formatTimecode(playhead)} / {formatTimecode(totalDuration)}
          </div>

          <div className="play-controls-center">
            <button className="control-btn" onClick={handleRewind} title="처음으로">
              <SkipBack size={18} />
            </button>
            <button 
              className={`control-btn active`}
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? '일시정지' : '재생'}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
          </div>

          <div style={{ width: '80px' }} /> {/* spacer */}
        </div>
      </div>
    </div>
  );
}
