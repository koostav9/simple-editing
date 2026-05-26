import { useState, useEffect } from 'react';
import MediaBin from './components/MediaBin';
import Player from './components/Player';
import PropertiesPanel from './components/PropertiesPanel';
import Timeline from './components/Timeline';
import { Film, Download } from 'lucide-react';

export default function App() {
  // Global Application State
  const [mediaList, setMediaList] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [clips, setClips] = useState([]);
  
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(40); // default: 40px per second
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState(null);

  // Export State
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Handle hotkeys (Space for play/pause, Delete to remove selected clip, Arrow keys to navigate)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Avoid hotkeys when editing inputs or interacting with buttons/selects to prevent double triggers
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          const selected = findClip(selectedClipId);
          if (selected) {
            handleDeleteClip(selected.id, selected.trackType);
          }
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setPlayhead(prev => Math.max(0, prev - 0.01));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setPlayhead(prev => prev + 0.01);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, clips]);

  // Helper to locate a clip and calculate layout positions
  function findClip(id) {
    const clip = clips.find(c => c.id === id);
    if (!clip) return null;
    return { ...clip, trackType: clip.type };
  }

  const handleAddMedia = (newMedia) => {
    setMediaList(prev => [...prev, newMedia]);
  };

  // Add media item to timeline (creates new track and clip)
  function handleTimelineAdd(mediaItem, _trackType = null, dropTime = null) {
    void _trackType;
    const trackId = 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const clipId = 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const newTrack = {
      id: trackId,
      name: mediaItem.name,
      type: mediaItem.type, // 'video' or 'audio'
      visible: true,
      muted: false
    };

    const newClip = {
      id: clipId,
      trackId: trackId,
      name: mediaItem.name,
      filePath: mediaItem.filePath,
      type: mediaItem.type,
      start: 0,
      end: mediaItem.duration,
      sourceDuration: mediaItem.duration,
      timelineStart: dropTime !== null ? dropTime : playhead,
      volume: 1,
      thumbnails: mediaItem.thumbnails || [],
      hasAudio: mediaItem.hasAudio || mediaItem.type === 'audio'
    };

    setTracks(prev => [...prev, newTrack]);
    setClips(prev => [...prev, newClip]);
  };

  // Update clip bounds (Trimming/Moving)
  function handleUpdateClipTimes(id, _trackType, start, end, timelineStart) {
    void _trackType;
    setClips(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, start, end, timelineStart };
      }
      return c;
    }));
  };

  // Update clip volume
  function handleUpdateVolume(id, _trackType, volume) {
    void _trackType;
    setClips(prev => prev.map(c => c.id === id ? { ...c, volume } : c));
  };

  // Split clip at current playhead
  function handleSplitClip(id, _trackType) {
    void _trackType;
    const clip = clips.find(c => c.id === id);
    if (!clip) return;

    const relPlayhead = playhead - clip.timelineStart;
    const cutPoint = clip.start + relPlayhead;

    if (cutPoint <= clip.start + 0.1 || cutPoint >= clip.end - 0.1) {
      alert('클립 경계선 근처는 분할할 수 없습니다.');
      return;
    }

    const clip1 = { 
      ...clip, 
      end: cutPoint 
    };
    const clip2 = { 
      ...clip, 
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9), 
      start: cutPoint,
      timelineStart: clip.timelineStart + relPlayhead
    };

    setClips(prev => {
      const idx = prev.findIndex(c => c.id === id);
      const updated = [...prev];
      updated.splice(idx, 1, clip1, clip2);
      return updated;
    });
    setSelectedClipId(clip2.id);
  };

  // Delete clip from track
  function handleDeleteClip(id, _trackType) {
    void _trackType;
    setClips(prev => {
      const remainingClips = prev.filter(c => c.id !== id);
      // Clean up empty tracks
      const activeTrackIds = new Set(remainingClips.map(c => c.trackId));
      setTracks(tPrev => tPrev.filter(t => activeTrackIds.has(t.id)));
      return remainingClips;
    });
    if (selectedClipId === id) {
      setSelectedClipId(null);
    }
  };

  // Extract audio from a timeline video clip (Capcut style)
  const handleExtractClipAudio = async (clipId) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip || clip.type !== 'video' || !clip.hasAudio) return;

    try {
      setIsPlaying(false);
      const audioPath = await window.api.extractAudio(clip.filePath);
      const audioMetadata = await window.api.getMetadata(audioPath);
      
      const newTrackId = 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const newClipId = 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      const newTrack = {
        id: newTrackId,
        name: '[추출] ' + clip.name.replace(/\.[^/.]+$/, "") + '.wav',
        type: 'audio',
        visible: true,
        muted: false
      };

      const newClip = {
        id: newClipId,
        trackId: newTrackId,
        name: '[추출] ' + clip.name.replace(/\.[^/.]+$/, "") + '.wav',
        filePath: audioPath,
        type: 'audio',
        start: clip.start,
        end: clip.end,
        sourceDuration: audioMetadata.duration,
        timelineStart: clip.timelineStart,
        volume: 1,
        hasAudio: true
      };

      // Mute the original video clip (Capcut style: volume = 0)
      setClips(prev => prev.map(c => {
        if (c.id === clip.id) {
          return { ...c, volume: 0 };
        }
        return c;
      }).concat(newClip));

      setTracks(prev => [...prev, newTrack]);
      setSelectedClipId(newClipId); // select the newly created audio clip
    } catch (err) {
      console.error(err);
      alert('오디오 분리에 실패했습니다:\n' + err.message);
    }
  };

  // Export Compilation Flow
  const handleExport = async () => {
    if (clips.length === 0) {
      alert('내보낼 클립이 타임라인에 없습니다.');
      return;
    }

    try {
      const outputPath = await window.api.selectSavePath();
      if (!outputPath) return;

      setIsPlaying(false);
      setExporting(true);
      setExportProgress(0);

      // Listen to progress IPC channel
      const removeListener = window.api.onExportProgress((percent) => {
        setExportProgress(percent);
      });

      await window.api.exportTimeline({
        tracks,
        clips,
        outputPath
      });

      removeListener();
      setExportProgress(100);
      setTimeout(() => {
        setExporting(false);
        alert('동영상 저장이 완료되었습니다!\n경로: ' + outputPath);
      }, 500);

    } catch (err) {
      console.error(err);
      setExporting(false);
      alert('내보내기 도중 오류가 발생했습니다:\n' + err.message);
    }
  };

  const selectedClip = selectedClipId ? findClip(selectedClipId) : null;

  return (
    <div className="app-container">
      {/* Top Bar */}
      <div className="top-nav">
        <div className="brand">
          <Film size={18} /> Simple Video Editor
        </div>
        
        <button className="export-btn" onClick={handleExport}>
          <Download size={16} /> 내보내기 (Export)
        </button>
      </div>

      {/* Main Grid View */}
      <div className="main-workspace">
        <div className="upper-pane">
          {/* Media list library */}
          <MediaBin 
            mediaList={mediaList} 
            onAddMedia={handleAddMedia}
            onTimelineAdd={handleTimelineAdd}
          />
          
          {/* Canvas player */}
          <Player 
            tracks={tracks}
            clips={clips}
            playhead={playhead}
            setPlayhead={setPlayhead}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            zoom={zoom}
          />

          {/* Properties mixer */}
          <PropertiesPanel 
            selectedClip={selectedClip}
            onUpdateVolume={handleUpdateVolume}
            onSplitClip={handleSplitClip}
            onDeleteClip={handleDeleteClip}
            onExtractClipAudio={handleExtractClipAudio}
            playhead={playhead}
          />
        </div>

        {/* Editing Timeline */}
        <Timeline 
          tracks={tracks}
          clips={clips}
          setTracks={setTracks}
          playhead={playhead}
          setPlayhead={setPlayhead}
          zoom={zoom}
          setZoom={setZoom}
          selectedClipId={selectedClipId}
          setSelectedClipId={setSelectedClipId}
          onUpdateClipTimes={handleUpdateClipTimes}
          onSplitClip={handleSplitClip}
          onDeleteClip={handleDeleteClip}
          onAddMediaToTimeline={handleTimelineAdd}
          onExtractClipAudio={handleExtractClipAudio}
        />
      </div>

      {/* Export progress modal overlay */}
      {exporting && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-title">동영상 렌더링 중...</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              타임라인을 1080p 고화질 MP4 파일로 내보내고 있습니다. 잠시만 기다려주세요.
            </div>
            
            <div className="progress-container">
              <div 
                className="progress-bar" 
                style={{ width: `${exportProgress}%` }}
              />
            </div>

            <div className="progress-text">
              <span>내보내기 진행률</span>
              <span>{exportProgress}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
