import { useState, useEffect, useRef } from 'react';
import { Settings, Volume2, Trash2, Scissors, Info } from 'lucide-react';

export default function PropertiesPanel({ 
  selectedClip, 
  onUpdateVolume, 
  onSplitClip, 
  onDeleteClip,
  onExtractClipAudio,
  playhead
}) {
  const [panelLogs, setPanelLogs] = useState([]);
  const logContainerRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPanelLogs(window.playbackLogs ? [...window.playbackLogs] : []);
    }, 200);
    return () => clearInterval(timer);
  }, []);

  // Auto scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [panelLogs]);

  const renderContent = () => {
    if (!selectedClip) {
      return (
        <div className="empty-state" style={{ padding: '40px 16px', textAlign: 'center' }}>
          <Info style={{ margin: '0 auto 12px', color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>타임라인에서 비디오 또는<br/>오디오 클립을 선택하세요.</p>
        </div>
      );
    }

    const volumePercent = Math.round((selectedClip.volume ?? 1) * 100);
    const clipDuration = selectedClip.end - selectedClip.start;
    const isVideo = selectedClip.trackType === 'video';
    const canSplit = playhead > selectedClip.timelineStart && playhead < selectedClip.timelineStart + clipDuration;

    const handleVolumeChange = (e) => {
      const val = parseFloat(e.target.value);
      onUpdateVolume(selectedClip.id, selectedClip.trackType, val);
    };

    return (
      <div className="properties-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: 0 }}>
        {/* Clip Title & Type */}
        <div className="properties-section">
          <span className="properties-label">클립명</span>
          <div className="properties-value" style={{ fontWeight: 600 }}>
            {selectedClip.name}
          </div>
        </div>

        <div className="properties-section">
          <span className="properties-label">클립 종류</span>
          <div className="properties-value" style={{ textTransform: 'capitalize' }}>
            {isVideo ? '📹 비디오 트랙 클립' : '🎵 오디오 트랙 클립'}
          </div>
        </div>

        {/* Volume Mixer */}
        <div className="properties-section">
          <span className="properties-label">볼륨 조절 ({volumePercent}%)</span>
          <div className="slider-group">
            <Volume2 size={16} style={{ color: 'var(--text-secondary)' }} />
            <input 
              type="range" 
              className="properties-slider"
              min="0"
              max="2"
              step="0.05"
              value={selectedClip.volume ?? 1}
              onChange={handleVolumeChange}
            />
            <span className="properties-slider-value">{volumePercent}%</span>
          </div>
        </div>

        {/* Trim Times Info */}
        <div className="properties-section">
          <span className="properties-label">시간 정보</span>
          <div className="properties-value" style={{ fontFamily: 'monospace', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>⏱️ 재생 시간: {clipDuration.toFixed(2)}초</div>
            <div>📂 소스 시작점: {selectedClip.start.toFixed(2)}초</div>
            <div>📂 소스 끝 지점: {selectedClip.end.toFixed(2)}초</div>
            <div>📍 타임라인 시작: {(selectedClip.timelineStart ?? 0).toFixed(2)}초</div>
          </div>
        </div>

        {/* Quick Operations */}
        <div className="properties-section" style={{ marginTop: '10px', gap: '10px' }}>
          {isVideo && selectedClip.hasAudio && (
            <button 
              className="modal-btn primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', backgroundColor: '#00f0ff', color: '#000', border: 'none' }}
              onClick={() => onExtractClipAudio(selectedClip.id)}
              title="동영상에서 오디오만 추출하여 새로운 오디오 트랙으로 분리하고 동영상을 음소거합니다."
            >
              <Scissors size={14} /> 음향 분리 (Extract Audio)
            </button>
          )}

          <button 
            className="modal-btn secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
            onClick={() => onSplitClip(selectedClip.id, selectedClip.trackType)}
            disabled={!canSplit}
            title={canSplit ? '플레이헤드 위치에서 자르기' : '플레이헤드가 클립 범위 내에 있어야 자를 수 있습니다.'}
          >
            <Scissors size={14} /> 현재 위치에서 분할 (Split)
          </button>
          
          <button 
            className="modal-btn secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', color: 'var(--accent-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
            onClick={() => onDeleteClip(selectedClip.id, selectedClip.trackType)}
          >
            <Trash2 size={14} /> 클립 삭제 (Delete)
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="panel properties-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div className="panel-header">
        <Settings size={16} /> 클립 속성 편집
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '16px', gap: '16px', boxSizing: 'border-box' }}>
        {renderContent()}

        {/* Log Viewer for Debugging */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: 'auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#00f0ff', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '0.5px' }}>
            <span>실시간 미디어 엔진 로그 (DEBUG)</span>
            <button 
              onClick={() => { window.playbackLogs = []; setPanelLogs([]); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '9px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              지우기
            </button>
          </div>
          <div 
            ref={logContainerRef}
            style={{ 
              height: '140px', 
              overflowY: 'auto', 
              backgroundColor: '#0a0a0c', 
              border: '1px solid var(--border-color)', 
              borderRadius: '4px', 
              padding: '8px', 
              fontFamily: 'monospace', 
              fontSize: '10px', 
              color: '#10b981', 
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap',
              boxSizing: 'border-box'
            }}
          >
            {panelLogs.length === 0 ? "로그가 없습니다. 재생/일시정지 시 로그가 기록됩니다." : panelLogs.join('\n')}
          </div>
        </div>
      </div>
    </div>
  );
}
