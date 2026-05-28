import { useState, useRef } from 'react';
import { Video, Music, Plus, Scissors, Loader } from 'lucide-react';
import * as api from '../utils/browserApi';

export default function MediaBin({ mediaList, onAddMedia, onUpdateMedia, onTimelineAdd }) {
  const [isImporting, setIsImporting] = useState(false);
  const [extractingIds, setExtractingIds] = useState({});
  const fileInputRef = useRef(null);

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const result = await api.selectFile('all');
      if (!result) return;

      const { file, objectUrl, name } = result;

      // Avoid duplicates
      if (mediaList.some(m => m.name === name && m.file?.size === file.size)) {
        alert('이미 추가된 파일입니다.');
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const metadata = await api.getMetadata(objectUrl);

      let thumbnails = [];
      if (metadata.hasVideo) {
        thumbnails = await api.generateThumbnails(objectUrl, metadata.duration);
      }

      const newMedia = {
        id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name,
        file,
        objectUrl,
        type: metadata.hasVideo ? 'video' : 'audio',
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        hasAudio: metadata.hasAudio,
        thumbnails,
        audioPeaks: [] // 처음에 빈 배열, 비동기로 업데이트
      };

      if (metadata.hasAudio) {
        // 백그라운드에서 오디오 파형 추출 (1000개 샘플)
        api.extractAudioPeaks(objectUrl, 1000).then(peaks => {
          onUpdateMedia(newMedia.id, { audioPeaks: peaks }, objectUrl);
        }).catch(err => console.error(err));
      }

      onAddMedia(newMedia);
    } catch (err) {
      console.error(err);
      alert('미디어를 가져오는 중에 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExtractAudio = async (mediaItem) => {
    if (!mediaItem.hasAudio) {
      alert('이 동영상에는 오디오 스트림이 없습니다.');
      return;
    }

    try {
      setExtractingIds(prev => ({ ...prev, [mediaItem.id]: true }));
      const result = await api.extractAudio(mediaItem.objectUrl, mediaItem.name);

      const newAudioMedia = {
        id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: result.name,
        objectUrl: result.objectUrl,
        type: 'audio',
        duration: result.duration,
        hasAudio: true,
        audioPeaks: []
      };

      api.extractAudioPeaks(result.objectUrl, 1000).then(peaks => {
        onUpdateMedia(newAudioMedia.id, { audioPeaks: peaks }, result.objectUrl);
      });

      onAddMedia(newAudioMedia);
      alert('오디오 분리가 완료되었습니다!');
    } catch (err) {
      console.error(err);
      alert('오디오를 분리하는 데 실패했습니다: ' + err.message);
    } finally {
      setExtractingIds(prev => ({ ...prev, [mediaItem.id]: false }));
    }
  };

  const handleDragStart = (e, mediaItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      ...mediaItem,
      file: undefined // File 객체는 직렬화 불가
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="panel media-bin-panel">
      <div className="panel-header">
        <Video size={16} /> 미디어 라이브러리 (Media Bin)
      </div>
      
      <div className="media-container">
        <div className="dropzone" onClick={handleImport}>
          <Plus size={24} />
          <div>클릭하여 미디어 파일 추가</div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            MP4, MKV, MOV, MP3, WAV 등 지원
          </span>
        </div>

        {/* Hidden file input for drag-drop fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*"
          style={{ display: 'none' }}
        />

        {isImporting && (
          <div style={{ textAlign: 'center', padding: '8px', color: 'var(--accent)' }}>
            <Loader size={16} className="animate-spin" style={{ display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }} />
            미디어 정보 분석 중...
          </div>
        )}

        <div className="media-list">
          {mediaList.map((item) => (
            <div 
              key={item.id} 
              className="media-item"
              draggable
              onDragStart={(e) => handleDragStart(e, item)}
            >
              <div className="media-item-thumb">
                {item.type === 'video' ? (
                  <Video size={28} style={{ color: 'var(--accent)' }} />
                ) : (
                  <Music size={28} style={{ color: '#10b981' }} />
                )}
                <div className="media-item-duration">{formatDuration(item.duration)}</div>
              </div>
              <div className="media-item-info">
                <div className="media-item-name" title={item.name}>{item.name}</div>
                <div className="media-item-actions">
                  <button 
                    className="media-btn-small"
                    onClick={() => onTimelineAdd(item)}
                    title="타임라인에 추가"
                  >
                    <Plus size={10} style={{ verticalAlign: 'middle' }} /> 담기
                  </button>
                  {item.type === 'video' && item.hasAudio && (
                    <button 
                      className="media-btn-small"
                      onClick={() => handleExtractAudio(item)}
                      disabled={extractingIds[item.id]}
                      title="소리 분리 (Extract Audio)"
                    >
                      {extractingIds[item.id] ? (
                        <Loader size={10} className="animate-spin" />
                      ) : (
                        <Scissors size={10} style={{ verticalAlign: 'middle' }} />
                      )}
                      {extractingIds[item.id] ? ' 분리중' : ' 음향분리'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {mediaList.length === 0 && !isImporting && (
          <div className="empty-state">
            <Video />
            <p>라이브러리가 비어 있습니다.<br/>미디어를 추가하거나 끌어다 놓으세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
