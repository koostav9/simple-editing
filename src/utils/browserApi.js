/**
 * browserApi.js - 브라우저 전용 API 레이어
 * 기존 Electron IPC (window.api)를 대체하는 순수 브라우저 API 모듈
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// ========== Internal Log System ==========
const MAX_LOGS = 200;
window.playbackLogs = window.playbackLogs || [];

export function log(msg) {
  const entry = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  console.log('[LOG]', msg);
  window.playbackLogs.push(entry);
  if (window.playbackLogs.length > MAX_LOGS) {
    window.playbackLogs.splice(0, window.playbackLogs.length - MAX_LOGS);
  }
}

// ========== File Selection ==========

/**
 * 파일 선택 다이얼로그를 열어 사용자가 미디어 파일을 선택하도록 합니다.
 * @param {string} type - 'video', 'audio', 또는 'all'
 * @returns {Promise<{file: File, objectUrl: string, name: string} | null>}
 */
export function selectFile(type = 'all') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';

    if (type === 'video') {
      input.accept = 'video/mp4,video/webm,video/quicktime,video/x-matroska,video/avi,.mp4,.mkv,.mov,.webm,.avi';
    } else if (type === 'audio') {
      input.accept = 'audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac,.mp3,.wav,.m4a,.ogg,.aac';
    } else {
      input.accept = 'video/*,audio/*';
    }

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      resolve({ file, objectUrl, name: file.name });
    };

    // 사용자가 취소할 경우 처리
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * 미디어 파일의 메타데이터를 추출합니다.
 * @param {string} objectUrl - blob URL
 * @returns {Promise<{duration, width, height, fps, hasVideo, hasAudio}>}
 */
export function getMetadata(objectUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('error', onError);
      // 타임아웃 시 오디오로 시도
      tryAudioMetadata(objectUrl).then(resolve).catch(reject);
    }, 10000);

    function finish(result) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('error', onError);
      resolve(result);
    }

    function buildResult() {
      const hasVideo = video.videoWidth > 0 && video.videoHeight > 0;
      let duration = video.duration;
      
      // NaN이나 Infinity인 경우 안전 처리
      if (!isFinite(duration) || isNaN(duration)) {
        duration = 0;
      }

      // 파일 MIME 타입이 video/*이면 일반적으로 오디오도 포함
      // (정확한 검출은 불가능하므로 video 파일이면 hasAudio=true로 가정)
      const hasAudio = true;

      log(`getMetadata 결과: duration=${duration}, size=${video.videoWidth}x${video.videoHeight}, hasVideo=${hasVideo}, hasAudio=${hasAudio}`);

      return {
        duration,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        fps: 30,
        hasVideo,
        hasAudio
      };
    }

    function onLoadedData() {
      finish(buildResult());
    }

    function onLoadedMeta() {
      // loadeddata가 안 오는 경우를 대비한 fallback (1초 후)
      setTimeout(() => {
        if (!resolved) {
          finish(buildResult());
        }
      }, 1000);
    }

    function onError() {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('error', onError);
      // 비디오로 로드 실패 시 오디오로 시도
      tryAudioMetadata(objectUrl).then(resolve).catch(() => {
        reject(new Error('미디어 메타데이터를 읽을 수 없습니다.'));
      });
    }

    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('loadedmetadata', onLoadedMeta);
    video.addEventListener('error', onError);
    video.src = objectUrl;
    // 일부 브라우저에서 load()를 명시적으로 호출해야 이벤트가 발생
    video.load();
  });
}

function tryAudioMetadata(objectUrl) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'auto';

    const timeoutId = setTimeout(() => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onErr);
      reject(new Error('오디오 메타데이터 로드 타임아웃'));
    }, 5000);

    function onLoaded() {
      clearTimeout(timeoutId);
      let duration = audio.duration;
      if (!isFinite(duration) || isNaN(duration)) duration = 0;
      
      resolve({
        duration,
        width: 0,
        height: 0,
        fps: 0,
        hasVideo: false,
        hasAudio: true
      });
    }

    function onErr() {
      clearTimeout(timeoutId);
      reject(new Error('오디오 메타데이터 로드 실패'));
    }

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onErr);
    audio.src = objectUrl;
    audio.load();
  });
}

// ========== Thumbnail Generation ==========

/**
 * 비디오에서 썸네일 프레임을 캡처합니다.
 * @param {string} objectUrl - 비디오 blob URL
 * @param {number} duration - 비디오 전체 길이 (초)
 * @param {number} count - 생성할 썸네일 수 (기본 60)
 * @returns {Promise<string[]>} Data URL 배열
 */
export function generateThumbnails(objectUrl, duration, count = 60) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.crossOrigin = 'anonymous';

    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 68;
    const ctx = canvas.getContext('2d');

    const thumbnails = [];
    const interval = Math.max(0.1, duration / count);
    let currentIndex = 0;

    function captureNext() {
      if (currentIndex >= count) {
        video.src = '';
        resolve(thumbnails);
        return;
      }

      const targetTime = currentIndex * interval;
      video.currentTime = Math.min(targetTime, duration - 0.1);
    }

    video.onseeked = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnails.push(canvas.toDataURL('image/jpeg', 0.6));
      } catch {
        thumbnails.push('');
      }
      currentIndex++;
      captureNext();
    };

    video.onloadeddata = () => {
      captureNext();
    };

    video.src = objectUrl;
  });
}

// ========== Audio Peak Generation ==========

/**
 * 오디오/비디오 파일에서 파형(Waveform) 데이터를 추출합니다.
 * @param {string} objectUrl - 미디어 blob URL
 * @param {number} samples - 추출할 데이터 포인트 수
 * @returns {Promise<number[]>} 0~1 사이의 정규화된 파형 배열
 */
export async function extractAudioPeaks(objectUrl, samples = 200) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(objectUrl);
    const buffer = await response.arrayBuffer();
    
    // 디코딩 (대용량 비디오 파일의 경우 메모리를 많이 쓸 수 있음)
    const audioBuffer = await audioCtx.decodeAudioData(buffer);
    const channelData = audioBuffer.getChannelData(0); // 첫 번째 채널

    const blockSize = Math.floor(channelData.length / samples);
    const peaks = [];
    
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      const start = i * blockSize;
      // 성능을 위해 블록의 모든 값을 더하지 않고 샘플링
      const step = Math.max(1, Math.floor(blockSize / 100)); 
      let count = 0;
      for (let j = 0; j < blockSize; j += step) {
        sum += Math.abs(channelData[start + j]);
        count++;
      }
      peaks.push(sum / count);
    }
    
    audioCtx.close();
    
    // 정규화 (가장 큰 소리가 1이 되도록)
    const max = Math.max(...peaks);
    if (max > 0) {
      return peaks.map(p => p / max);
    }
    return peaks;
  } catch (err) {
    console.error('Audio peak extraction failed:', err);
    return [];
  }
}

// ========== FFmpeg.wasm Singleton ==========

let ffmpegInstance = null;
let ffmpegLoading = false;
let ffmpegLoadPromise = null;

async function getFFmpeg() {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  if (ffmpegLoading) {
    return ffmpegLoadPromise;
  }

  ffmpegLoading = true;
  ffmpegInstance = new FFmpeg();
  
  ffmpegInstance.on('log', ({ message }) => {
    log(`[FFmpeg] ${message}`);
  });

  ffmpegLoadPromise = ffmpegInstance.load().then(() => {
    ffmpegLoading = false;
    log('[FFmpeg] WASM 코어 로드 완료');
    return ffmpegInstance;
  });

  return ffmpegLoadPromise;
}

// ========== Audio Extraction (FFmpeg.wasm) ==========

/**
 * 비디오에서 오디오를 추출합니다.
 * @param {string} objectUrl - 비디오 blob URL
 * @param {string} fileName - 원본 파일명
 * @returns {Promise<{objectUrl: string, name: string, duration: number}>}
 */
export async function extractAudio(objectUrl, fileName) {
  log('오디오 추출 시작...');
  const ffmpeg = await getFFmpeg();

  const inputName = 'input_' + Date.now() + '.mp4';
  const outputName = 'output_' + Date.now() + '.wav';

  const fileData = await fetchFile(objectUrl);
  await ffmpeg.writeFile(inputName, fileData);

  await ffmpeg.exec([
    '-i', inputName,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '2',
    outputName
  ]);

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: 'audio/wav' });
  const audioUrl = URL.createObjectURL(blob);

  // 정리
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  // 메타데이터 가져오기
  const metadata = await getMetadata(audioUrl);

  const baseName = fileName.replace(/\.[^/.]+$/, '');
  log('오디오 추출 완료');

  return {
    objectUrl: audioUrl,
    name: `[추출] ${baseName}.wav`,
    duration: metadata.duration
  };
}

// ========== Export Timeline (FFmpeg.wasm) ==========

/**
 * 타임라인을 MP4로 렌더링하여 다운로드합니다.
 * @param {object} params - { tracks, clips, onProgress, onStatus }
 */
export async function exportTimeline({ tracks, clips, onProgress, onStatus }) {
  const status = (msg) => {
    log(msg);
    if (onStatus) onStatus(msg);
  };

  status('FFmpeg 코어 준비 중...');
  const ffmpeg = await getFFmpeg();

  // 진행률 리스너
  const onFFmpegProgress = ({ progress }) => {
    if (onProgress && typeof progress === 'number') {
      onProgress(Math.round(Math.max(0, Math.min(100, progress * 100))));
    }
  };
  ffmpeg.on('progress', onFFmpegProgress);

  try {
    // 1. 고유 미디어 파일 수집 및 가상 파일시스템에 쓰기
    const uniqueFiles = [];
    const fileNameMap = {}; // objectUrl → virtual filename

    for (const clip of clips) {
      if (!fileNameMap[clip.objectUrl]) {
        const ext = clip.name ? clip.name.split('.').pop() : 'mp4';
        const virtualName = `input_${uniqueFiles.length}.${ext}`;
        fileNameMap[clip.objectUrl] = virtualName;
        uniqueFiles.push({ objectUrl: clip.objectUrl, virtualName });
      }
    }

    status(`미디어 파일 준비 중... (0/${uniqueFiles.length})`);
    for (let i = 0; i < uniqueFiles.length; i++) {
      const { objectUrl, virtualName } = uniqueFiles[i];
      status(`미디어 파일 읽는 중... (${i + 1}/${uniqueFiles.length})`);
      const fileData = await fetchFile(objectUrl);
      await ffmpeg.writeFile(virtualName, fileData);
      log(`파일 로드 완료: ${virtualName}`);
    }

    // 2. FFmpeg filter_complex 명령어 조립
    const getFileIndex = (objectUrl) => {
      const virtualName = fileNameMap[objectUrl];
      return uniqueFiles.findIndex(f => f.virtualName === virtualName);
    };

    let totalDuration = clips.length > 0
      ? Math.max(...clips.map(c => c.timelineStart + (c.end - c.start)))
      : 1;

    const inputArgs = [];
    uniqueFiles.forEach(({ virtualName }) => {
      inputArgs.push('-i', virtualName);
    });

    const filterComplex = [];

    // --- VIDEO PIPELINE ---
    let currentBaseLabel = '[v_base]';
    const visibleVideoClips = [];

    tracks.forEach((track) => {
      if (track.type !== 'video' || track.visible === false) return;
      const trackClips = clips.filter(c => c.trackId === track.id);
      visibleVideoClips.push(...trackClips);
    });

    filterComplex.push(`color=c=black:s=1920x1080:r=30:d=${totalDuration}[v_base]`);

    if (visibleVideoClips.length > 0) {
      visibleVideoClips.forEach((clip, idx) => {
        const inIdx = getFileIndex(clip.objectUrl);
        const clipLabel = `[v_clip_${idx}]`;
        const nextBaseLabel = idx === visibleVideoClips.length - 1 ? '[outv]' : `[v_layer_${idx}]`;

        const scaleStr = `[${inIdx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30`;
        const trimStr = `trim=start=${clip.start}:end=${clip.end},setpts=PTS-STARTPTS`;
        filterComplex.push(`${scaleStr},${trimStr}${clipLabel}`);

        const duration = clip.end - clip.start;
        const overlayEnable = `between(t,${clip.timelineStart},${clip.timelineStart + duration})`;
        filterComplex.push(`${currentBaseLabel}${clipLabel}overlay=shortest=0:x=0:y=0:enable='${overlayEnable}'${nextBaseLabel}`);

        currentBaseLabel = `[v_layer_${idx}]`;
      });
    } else {
      filterComplex.push(`color=c=black:s=1920x1080:r=30:d=${totalDuration}[outv]`);
    }

    // --- AUDIO PIPELINE ---
    const allAudioClips = [];
    clips.forEach(clip => {
      const track = tracks.find(t => t.id === clip.trackId);
      if (!track || track.muted === true) return;
      const hasSound = clip.type === 'audio' || (clip.type === 'video' && clip.hasAudio);
      if (hasSound && (clip.volume ?? 1) > 0) {
        allAudioClips.push(clip);
      }
    });

    const audioOutLabels = [];

    if (allAudioClips.length > 0) {
      allAudioClips.forEach((clip, j) => {
        const inIdx = getFileIndex(clip.objectUrl);
        const label = `[a_raw_${j}]`;
        const volLabel = `[a_vol_${j}]`;
        const delayLabel = `[a_delay_${j}]`;

        filterComplex.push(`[${inIdx}:a]atrim=start=${clip.start}:end=${clip.end},asetpts=PTS-STARTPTS${label}`);
        filterComplex.push(`${label}volume=${clip.volume}${volLabel}`);

        const delayMs = Math.round(clip.timelineStart * 1000);
        filterComplex.push(`${volLabel}adelay=delays=${delayMs}:all=1${delayLabel}`);

        audioOutLabels.push(delayLabel);
      });

      const mixInputs = audioOutLabels.join('');
      filterComplex.push(`${mixInputs}amix=inputs=${allAudioClips.length}:duration=longest[outa]`);
    } else {
      filterComplex.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalDuration}[outa]`);
    }

    const filterComplexStr = filterComplex.join(';');
    const outputName = 'output.mp4';

    const args = [
      '-y',
      ...inputArgs,
      '-filter_complex', filterComplexStr,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast', // 렌더링 속도 최우선 (WASM 환경 필수)
      '-crf', '28', // 속도 및 용량 최적화 (기본값 23보다 약간 더 빠른 렌더링)
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputName
    ];

    status('FFmpeg 비디오 렌더링 시작...');
    log(`명령어: ${args.join(' ')}`);

    await ffmpeg.exec(args);

    // 3. 출력 파일 읽기 → 다운로드
    status('최종 파일 생성 중...');
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    downloadBlob(blob, 'exported_video.mp4');

    // 정리
    for (const { virtualName } of uniqueFiles) {
      try { await ffmpeg.deleteFile(virtualName); } catch { /* ignore */ }
    }
    try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }

    status('내보내기 완료!');
    return true;
  } finally {
    ffmpeg.off('progress', onFFmpegProgress);
  }
}

// ========== Download Helper ==========

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
