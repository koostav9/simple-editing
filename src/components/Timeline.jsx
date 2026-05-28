import { useRef } from 'react';
import { Scissors, Trash2, ZoomIn, ZoomOut, Video, Music, Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';

export default function Timeline({
  tracks,
  clips,
  setTracks,
  playhead,
  setPlayhead,
  zoom,
  setZoom,
  selectedClipId,
  setSelectedClipId,
  onUpdateClipTimes,
  onSplitClip,
  onDeleteClip,
  onAddMediaToTimeline,
  onExtractClipAudio
}) {
  const rulerRef = useRef(null);
  const containerRef = useRef(null);

  // Constants
  const minZoom = 2; // 2px per second (1200px screens fit 10 minutes)
  const maxZoom = 150; // 150px per second
  const scale = zoom;

  // Calculate total timeline duration based on max end time of all clips
  const timelineDuration = clips.length > 0
    ? Math.max(...clips.map(c => c.timelineStart + (c.end - c.start)))
    : 10;
  const totalRulerSeconds = Math.ceil(timelineDuration + 15);

  // Compute absolute layout positions for clips (free layout on their tracks)
  const clipsWithLayout = clips.map(clip => {
    const duration = clip.end - clip.start;
    return {
      ...clip,
      left: clip.timelineStart * scale,
      width: duration * scale
    };
  });

  // Render Ticks for Ruler
  const renderRulerTicks = () => {
    const ticks = [];
    const step = scale < 5 ? 30 : scale < 12 ? 10 : scale < 25 ? 5 : scale < 50 ? 2 : 1;
    
    for (let s = 0; s < totalRulerSeconds; s += step) {
      ticks.push(
        <div
          key={s}
          className="ruler-tick major"
          style={{ left: `${s * scale}px` }}
        >
          {s}s
        </div>
      );
      
      if (step > 1) {
        for (let m = 1; m < step; m++) {
          if (s + m < totalRulerSeconds) {
            ticks.push(
              <div
                key={`${s}-${m}`}
                className="ruler-tick"
                style={{ left: `${(s + m) * scale}px` }}
              />
            );
          }
        }
      }
    }
    return ticks;
  };

  // Playhead dragging & seeking
  const handleSeek = (clientX) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    let newTime = relativeX / scale;
    if (newTime < 0) newTime = 0;
    if (newTime > totalRulerSeconds) newTime = totalRulerSeconds;
    setPlayhead(newTime);
  };

  const handleRulerMouseDown = (e) => {
    handleSeek(e.clientX);
    
    const handleMouseMove = (moveEvent) => {
      handleSeek(moveEvent.clientX);
    };
    
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Drag and Drop files from Media Bin
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e, trackType) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const mediaItem = JSON.parse(dataStr);
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const dropTime = x / scale;

      onAddMediaToTimeline(mediaItem, trackType, dropTime);
    } catch (err) {
      console.error(err);
    }
  };

  // Drag to Trim logic
  const handleTrimStart = (e, clip, edge) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const initialStart = clip.start;
    const initialEnd = clip.end;
    const initialTimelineStart = clip.timelineStart;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSec = deltaX / scale;

      if (edge === 'right') {
        const newEnd = Math.max(initialStart + 0.1, initialEnd + deltaSec);
        onUpdateClipTimes(clip.id, clip.type, initialStart, newEnd, clip.timelineStart);
      } else if (edge === 'left') {
        const newStart = Math.min(initialEnd - 0.1, Math.max(0, initialStart + deltaSec));
        const actualShift = newStart - initialStart;
        const newTimelineStart = Math.max(0, initialTimelineStart + actualShift);
          
        onUpdateClipTimes(clip.id, clip.type, newStart, initialEnd, newTimelineStart);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Drag to Move Clip horizontally
  const handleClipMoveStart = (e, clip) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const initialTimelineStart = clip.timelineStart;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSec = deltaX / scale;
      const newTimelineStart = Math.max(0, initialTimelineStart + deltaSec);
      
      onUpdateClipTimes(clip.id, clip.type, clip.start, clip.end, newTimelineStart);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const selectedClip = clipsWithLayout.find(c => c.id === selectedClipId);

  // 1. Render Video Thumbnail Filmstrip
  const renderVideoThumbnails = (clip) => {
    if (!clip.thumbnails || clip.thumbnails.length === 0) return null;
    
    const numThumbs = Math.max(1, Math.floor(clip.width / 80));
    const thumbs = [];
    
    for (let i = 0; i < numThumbs; i++) {
      const timeFraction = (i + 0.5) / numThumbs;
      const sourceTime = clip.start + timeFraction * (clip.end - clip.start);
      const fractionOfSource = sourceTime / clip.sourceDuration;
      
      // Map fractionOfSource (0.0 to 1.0) to index of the extracted thumbnails array
      const thumbIdx = Math.min(clip.thumbnails.length - 1, Math.max(0, Math.floor(fractionOfSource * clip.thumbnails.length)));
      
      const thumbSrc = clip.thumbnails[thumbIdx];
      if (thumbSrc) {
        thumbs.push(
          <img
            key={i}
            src={thumbSrc}
            alt="thumb"
            className="timeline-clip-thumb-img"
            style={{ width: `${100 / numThumbs}%`, height: '100%', objectFit: 'cover', opacity: 0.85, borderRight: '1px solid rgba(0,0,0,0.2)' }}
          />
        );
      }
    }
    // Limit thumbnail height and offset it below the header text
    return <div className="timeline-clip-thumbs" style={{ position: 'absolute', top: '20px', left: 0, right: 0, height: '38px', display: 'flex', overflow: 'hidden', pointerEvents: 'none' }}>{thumbs}</div>;
  };

  // 2. Render Audio Waveform Bars
  const renderAudioWaveform = (clip, isEmbeddedInVideo = false) => {
    const barWidth = 2;
    const gap = 3;
    const step = barWidth + gap; // 5px
    
    // Set a high cap (1200) to keep rendering performance optimal while maintaining dense details
    const numBars = Math.min(1200, Math.max(8, Math.floor(clip.width / step)));
    const bars = [];
    
    for (let i = 0; i < numBars; i++) {
      const timeFraction = i / numBars;
      const sourceTime = clip.start + timeFraction * (clip.end - clip.start);
      
      let combined = 0.05; // 파형 로딩 중에는 약간의 기본 선명도만 유지
      if (clip.audioPeaks && clip.audioPeaks.length > 0) {
        const fractionOfSource = sourceTime / clip.sourceDuration;
        const peakIdx = Math.min(clip.audioPeaks.length - 1, Math.max(0, Math.floor(fractionOfSource * clip.audioPeaks.length)));
        
        // 인간의 청각은 로그 스케일이므로, 시각적으로 더 잘 보이도록 제곱근 처리를 하고 볼륨을 증폭합니다.
        const rawPeak = clip.audioPeaks[peakIdx] || 0;
        combined = Math.pow(rawPeak, 0.5) * 1.5;
      }
      
      const volumeScale = clip.volume ?? 1;
      // 소리가 작은 부분은 높이가 0에 가깝도록 (2%) 수정
      // peak 값이 작을 때도 2%는 유지하도록 함
      const heightPercent = Math.max(2, Math.min(95, (combined * 100) * volumeScale));
      
      bars.push(
        <div
          key={i}
          className="timeline-waveform-bar"
          style={{ 
            height: `${heightPercent}%`,
            width: `${barWidth}px`,
            backgroundColor: isEmbeddedInVideo 
              ? (clip.volume === 0 ? '#4b5563' : '#00f0ff') 
              : '#00e5ff',
            opacity: clip.volume === 0 ? 0.35 : 0.85,
            borderRadius: '1px 1px 0 0',
            transition: 'height 0.15s ease'
          }}
        />
      );
    }
    
    const containerStyle = isEmbeddedInVideo
      ? { position: 'absolute', height: '20px', bottom: '2px', left: 0, right: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', gap: `${gap}px`, padding: '0 4px', pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }
      : { position: 'absolute', top: '18px', left: 0, right: 0, bottom: '2px', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', gap: `${gap}px`, padding: '0 4px', pointerEvents: 'none', zIndex: 0, overflow: 'hidden' };

    return <div className="timeline-clip-waveform" style={containerStyle}>{bars}</div>;
  };

  return (
    <div className="lower-pane">
      {/* Timeline Toolbar */}
      <div className="timeline-toolbar">
        <div className="toolbar-group">
          <button 
            className="toolbar-btn"
            onClick={() => onSplitClip(selectedClip.id, selectedClip.type)}
            disabled={!selectedClip}
            title="분할하기 (Split)"
          >
            <Scissors size={14} /> 분할 (Split)
          </button>
          {selectedClip && selectedClip.type === 'video' && selectedClip.hasAudio && (
            <button 
              className="toolbar-btn"
              onClick={() => onExtractClipAudio(selectedClip.id)}
              title="음향 분리 (Extract Audio)"
            >
              <Music size={14} style={{ color: '#00f0ff' }} /> 음향 분리
            </button>
          )}
          <button 
            className="toolbar-btn"
            onClick={() => onDeleteClip(selectedClip.id, selectedClip.type)}
            disabled={!selectedClip}
            style={{ color: selectedClip ? 'var(--accent-danger)' : 'inherit' }}
            title="선택된 클립 삭제"
          >
            <Trash2 size={14} /> 삭제 (Delete)
          </button>
        </div>

        <div className="toolbar-group" style={{ gap: '12px' }}>
          <ZoomOut size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="range"
            className="zoom-slider"
            min={minZoom}
            max={maxZoom}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
          />
          <ZoomIn size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>



      {/* Main Track Layout Grid */}
      <div className="timeline-workspace" ref={containerRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
        <div 
          className="timeline-content" 
          style={{ width: `${totalRulerSeconds * scale + 160}px`, height: '100%', position: 'relative' }}
        >
          {/* Playhead line overlay (offset by 160px to match clips) */}
          <div 
            className="timeline-playhead" 
            style={{ left: `${playhead * scale + 160}px` }}
          >
            <div className="timeline-playhead-cap" />
          </div>

          {/* 1. Time Ruler Row */}
          <div style={{ display: 'flex', height: '28px', borderBottom: '1px solid var(--border-color)', position: 'relative' }}>
            <div style={{ width: '160px', flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, backgroundColor: 'var(--bg-panel-header)', borderBottom: '1px solid var(--border-color)' }} />
            <div 
              className="timeline-ruler" 
              ref={rulerRef} 
              onMouseDown={handleRulerMouseDown}
              style={{ flex: 1, position: 'relative', height: '100%' }}
            >
              {renderRulerTicks()}
            </div>
          </div>

          {/* 2. Tracks Area */}
          <div className="timeline-tracks" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0' }}>
            {tracks.map(track => {
              const trackClips = clipsWithLayout.filter(c => c.trackId === track.id);
              const isVideo = track.type === 'video';
              // 비디오와 오디오 트랙 모두 동일하게 높여서 오디오 파형이 잘 보이도록 함
              const height = isVideo ? '88px' : '88px';
              const clipHeight = isVideo ? '80px' : '80px';

              return (
                <div 
                  key={track.id} 
                  style={{ display: 'flex', height: height, borderBottom: '1px solid var(--border-color)', position: 'relative' }}
                >
                  {/* Left Track label block / tile (sticky) */}
                  <div 
                    style={{ 
                      width: '160px', 
                      flexShrink: 0, 
                      position: 'sticky', 
                      left: 0, 
                      zIndex: 10, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      borderRight: '1px solid var(--border-color)', 
                      backgroundColor: 'var(--bg-panel)', 
                      padding: '0 8px',
                      boxSizing: 'border-box'
                    }}
                  >
                    {/* Track info tile */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
                      {isVideo ? (
                        <Video size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      ) : (
                        <Music size={13} style={{ color: '#00e5ff', flexShrink: 0 }} />
                      )}
                      <span 
                        style={{ 
                          fontSize: '11px', 
                          fontWeight: 500, 
                          color: 'var(--text-primary)', 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis' 
                        }}
                        title={track.name}
                      >
                        {track.name}
                      </span>
                    </div>

                    {/* Track action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px', flexShrink: 0 }}>
                      {isVideo ? (
                        <button
                          onClick={() => {
                            setTracks(prev => prev.map(t => t.id === track.id ? { ...t, visible: !t.visible } : t));
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
                          title={track.visible ? "비디오 숨기기" : "비디오 보이기"}
                        >
                          {track.visible ? <Eye size={12} /> : <EyeOff size={12} style={{ color: 'var(--accent-danger)' }} />}
                        </button>
                      ) : null}

                      <button
                        onClick={() => {
                          setTracks(prev => prev.map(t => t.id === track.id ? { ...t, muted: !t.muted } : t));
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
                        title={track.muted ? "음소거 해제" : "음소거"}
                      >
                        {track.muted ? <VolumeX size={12} style={{ color: 'var(--accent-danger)' }} /> : <Volume2 size={12} />}
                      </button>

                      <button
                        onClick={() => {
                          // Delete track and all its clips
                          trackClips.forEach(c => onDeleteClip(c.id, track.type));
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
                        title="트랙 삭제"
                      >
                        <Trash2 size={12} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                    </div>
                  </div>

                  {/* Right Clips Area */}
                  <div 
                    style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'center', overflow: 'visible' }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, track.type)}
                  >
                    {trackClips.map(clip => (
                      <div
                        key={clip.id}
                        className={`timeline-clip ${selectedClipId === clip.id ? 'selected' : ''}`}
                        style={{ 
                          left: `${clip.left}px`, 
                          width: `${clip.width}px`, 
                          height: clipHeight, 
                          padding: 0, 
                          border: selectedClipId === clip.id 
                            ? '1.5px solid var(--accent)' 
                            : isVideo 
                            ? '1px solid #009688' 
                            : '1px solid #00b4d8', 
                          background: isVideo 
                            ? '#0e1d1f' 
                            : 'linear-gradient(135deg, rgba(0, 229, 255, 0.08) 0%, rgba(10, 20, 26, 0.95) 100%)',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClipId(clip.id);
                        }}
                        onMouseDown={(e) => handleClipMoveStart(e, clip)}
                      >
                        {/* Render Video Thumbnails Background (top-half) */}
                        {isVideo && renderVideoThumbnails(clip)}

                        {/* Render Audio Waveform (for audio, or embedded in video) */}
                        {isVideo 
                          ? renderAudioWaveform(clip, true) 
                          : renderAudioWaveform(clip, false)
                        }

                        {/* Clip Header Text overlay */}
                        <div 
                          style={{ 
                            position: 'absolute', 
                            top: 0, 
                            left: 0, 
                            right: 0, 
                            height: isVideo ? '20px' : '18px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            background: isVideo ? 'rgba(0,0,0,0.65)' : 'rgba(0, 229, 255, 0.15)', 
                            padding: '0 6px', 
                            fontSize: isVideo ? '10px' : '9px', 
                            borderBottom: isVideo ? '1px solid rgba(255,255,255,0.1)' : 'none', 
                            color: isVideo ? '#e4e4e7' : '#00e5ff', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            pointerEvents: 'none', 
                            zIndex: 1 
                          }}
                        >
                          {isVideo ? `✨ Filters | 🎬 Edit | ${clip.volume === 0 ? '🔇' : '🔊'} ${clip.name}` : `Speed 1.0x | 🎵 ${clip.name}`}
                        </div>

                        {/* Left Trim Handle */}
                        <div 
                          className="trim-handle left" 
                          onMouseDown={(e) => handleTrimStart(e, clip, 'left')}
                        />

                        {/* Right Trim Handle */}
                        <div 
                          className="trim-handle right" 
                          onMouseDown={(e) => handleTrimStart(e, clip, 'right')}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
