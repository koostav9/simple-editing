import { useRef, useEffect } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';
import { log } from '../utils/browserApi';

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

  // Get unique video and audio files from clips (use objectUrl as key)
  const uniqueVideoFiles = [];
  const uniqueAudioFiles = [];
  clips.forEach(c => {
    if (c.type === 'video') {
      if (!uniqueVideoFiles.includes(c.objectUrl)) {
        uniqueVideoFiles.push(c.objectUrl);
      }
    } else {
      if (!uniqueAudioFiles.includes(c.objectUrl)) {
        uniqueAudioFiles.push(c.objectUrl);
      }
    }
  });

  // Compute total timeline duration
  const totalDuration = clips.length > 0
    ? Math.max(...clips.map(c => c.timelineStart + (c.end - c.start)))
    : 0;

  // Sync internal ref with parent state
  useEffect(() => {
    if (ignorePlayheadSyncRef.current) {
      ignorePlayheadSyncRef.current = false;
      return;
    }
    currentPlayheadRef.current = playhead;
  }, [playhead, isPlaying]);

  // Find active video clip at a given timeline time
  const getActiveVideoClip = (time) => {
    for (let i = tracks.length - 1; i >= 0; i--) {
      const track = tracks[i];
      if (track.type === 'video' && track.visible !== false) {
        const trackClips = clips.filter(c => c.trackId === track.id);
        for (const clip of trackClips) {
          const duration = clip.end - clip.start;
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
        if (v) { v.pause(); }
      });
      Object.values(audioRefs.current).forEach(a => { 
        if (a) { a.pause(); }
      });

      log(`Playback STOP (Pause): ref=${currentPlayheadRef.current}`);

      // Seek active video to sync preview frame
      const active = getActiveVideoClip(playhead);
      if (active) {
        const { clip, timelineStart } = active;
        const videoEl = videoRefs.current[clip.objectUrl];
        if (videoEl) {
          const rawTarget = (playhead - timelineStart) + clip.start;
          const maxDuration = videoEl.duration || clip.sourceDuration || 999999;
          const clampedTarget = Math.max(0, Math.min(maxDuration, rawTarget));
          const track = tracks.find(t => t.id === clip.trackId);
          const isMuted = track ? track.muted : false;
          videoEl.volume = isMuted ? 0 : (clip.volume ?? 1);
          videoEl.muted = isMuted || (clip.volume ?? 1) === 0;
          
          if (!isNaN(clampedTarget)) {
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
      log(`Playback START: playhead prop=${playhead}, ref=${currentPlayheadRef.current}`);
      lastTimeRef.current = performance.now();
      let lastStateUpdate = performance.now();

      const loop = () => {
        const now = performance.now();
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;

        // 1. Find the active video clip
        const activeVideo = getActiveVideoClip(currentPlayheadRef.current);
        let nextPlayhead = currentPlayheadRef.current;

        if (activeVideo) {
          const { clip, timelineStart } = activeVideo;
          const videoEl = videoRefs.current[clip.objectUrl];
          
          if (videoEl) {
            // Ensure the master video element is playing
            if (videoEl.paused && !videoEl.playRequested) {
              videoEl.playRequested = true;
              const targetTime = (currentPlayheadRef.current - timelineStart) + clip.start;
              const maxDuration = videoEl.duration || clip.sourceDuration || 999999;
              const clampedTarget = Math.max(0, Math.min(maxDuration, targetTime));

              const track = tracks.find(t => t.id === clip.trackId);
              const isMuted = track ? track.muted : false;
              videoEl.volume = isMuted ? 0 : (clip.volume ?? 1);
              videoEl.muted = isMuted || (clip.volume ?? 1) === 0;

              // Seek to target position
              if (Math.abs(videoEl.currentTime - clampedTarget) > 0.1) {
                videoEl.currentTime = clampedTarget;
              }

              videoEl.play()
                .then(() => { 
                  videoEl.playRequested = false;
                })
                .catch(e => { 
                  videoEl.playRequested = false; 
                  console.error('Video play error:', e);
                });
            } else if (!videoEl.paused) {
              // Apply volume/mute dynamically during playback
              const track = tracks.find(t => t.id === clip.trackId);
              const isMuted = track ? track.muted : false;
              videoEl.volume = isMuted ? 0 : (clip.volume ?? 1);
              videoEl.muted = isMuted || (clip.volume ?? 1) === 0;
            }

            // Drive playhead from video's actual position
            if (!videoEl.paused && !videoEl.seeking && !videoEl.playRequested) {
              const expectedTime = (currentPlayheadRef.current - timelineStart) + clip.start;
              const actualTime = videoEl.currentTime;
              const positionError = Math.abs(actualTime - expectedTime);

              if (positionError > 0.5) {
                videoEl.currentTime = expectedTime;
                nextPlayhead = currentPlayheadRef.current + delta;
              } else {
                nextPlayhead = actualTime - clip.start + timelineStart;
              }
            } else {
              nextPlayhead = currentPlayheadRef.current + delta;
            }

            drawFrame(videoEl);
          } else {
            nextPlayhead = currentPlayheadRef.current + delta;
          }
        } else {
          nextPlayhead = currentPlayheadRef.current + delta;
          clearCanvas();
        }

        // Clip the playhead to the total duration
        if (nextPlayhead >= totalDuration) {
          setIsPlaying(false);
          setPlayhead(totalDuration);
          currentPlayheadRef.current = totalDuration;
          // Pause all media elements
          Object.values(videoRefs.current).forEach(v => { if (v && !v.paused) v.pause(); });
          Object.values(audioRefs.current).forEach(a => { if (a && !a.paused) a.pause(); });
          return;
        }

        currentPlayheadRef.current = nextPlayhead;

        // 2. Sync audio clips
        clips.forEach(clip => {
          if (clip.type === 'audio' || (clip.type === 'video' && clip.hasAudio)) {
            const mediaEl = clip.type === 'audio' 
              ? audioRefs.current[clip.objectUrl] 
              : null; // Video audio is handled by the video element

            if (!mediaEl) return;

            const clipDuration = clip.end - clip.start;
            const isInRange = nextPlayhead >= clip.timelineStart && nextPlayhead <= clip.timelineStart + clipDuration;

            if (!isInRange) {
              if (!mediaEl.paused) mediaEl.pause();
              return;
            }

            const track = tracks.find(t => t.id === clip.trackId);
            const isMuted = track ? track.muted : false;
            mediaEl.volume = isMuted ? 0 : (clip.volume ?? 1);
            mediaEl.muted = isMuted;

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
              if (Math.abs(drift) > 0.5) {
                mediaEl.currentTime = targetTime;
              }
            }
          }
        });

        // 3. Throttled UI state update (~30fps for React)
        if (now - lastStateUpdate > 33) {
          lastStateUpdate = now;
          ignorePlayheadSyncRef.current = true;
          setPlayhead(currentPlayheadRef.current);
        }

        animationFrameId.current = requestAnimationFrame(loop);
      };

      animationFrameId.current = requestAnimationFrame(loop);

      return () => {
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
        }
      };
    } else {
      // Pause all media
      Object.values(videoRefs.current).forEach(v => { if (v && !v.paused) v.pause(); });
      Object.values(audioRefs.current).forEach(a => { if (a && !a.paused) a.pause(); });
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, clips, tracks, totalDuration, scale]);

  // Canvas drawing
  function drawFrame(videoEl) {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) return;
    if (videoEl.readyState < 1) return;
    
    const ctx = canvas.getContext('2d');
    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 360;
    
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
    
    try {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      console.error('drawFrame error:', e);
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const handleRewind = () => {
    setIsPlaying(false);
    setPlayhead(0);
  };

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
        <div className="canvas-wrapper">
          <canvas ref={canvasRef} className="player-canvas" />
        </div>

        {/* Hidden video and audio elements */}
        <div style={{ display: 'none' }}>
          {uniqueVideoFiles.map(objectUrl => (
            <video 
              key={objectUrl}
              ref={el => videoRefs.current[objectUrl] = el}
              src={objectUrl}
              preload="auto"
              onSeeked={(e) => {
                const active = getActiveVideoClip(playhead);
                if (active && active.clip.objectUrl === objectUrl) {
                  drawFrame(e.target);
                }
              }}
              onLoadedData={() => {
                const active = getActiveVideoClip(playhead);
                if (active && active.clip.objectUrl === objectUrl) {
                  const videoEl = videoRefs.current[objectUrl];
                  if (videoEl) drawFrame(videoEl);
                }
              }}
            />
          ))}
          {uniqueAudioFiles.map(objectUrl => (
            <audio 
              key={objectUrl}
              ref={el => audioRefs.current[objectUrl] = el}
              src={objectUrl}
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

          <div style={{ width: '80px' }} />
        </div>
      </div>
    </div>
  );
}
