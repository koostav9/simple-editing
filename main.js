const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
// Register custom protocol for local media streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      bypassCSP: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

let mainWindow;

function getFfmpegPath() {
  let ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
  if (app.isPackaged) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  return ffmpegPath;
}

function getFfprobePath() {
  let ffprobePath = require('@ffprobe-installer/ffprobe').path;
  if (app.isPackaged) {
    ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');
  }
  return ffprobePath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'Capcut Style Video Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load dev server in development if online, otherwise fallback to built output
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const http = require('http');
    const req = http.request({ host: 'localhost', port: 5173, timeout: 500 }, () => {
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
      req.destroy();
    });
    req.on('error', () => {
      const distPath = path.join(__dirname, 'dist', 'index.html');
      if (fs.existsSync(distPath)) {
        mainWindow.loadFile(distPath);
      } else {
        mainWindow.loadURL('data:text/html,<html><body style="background-color:#121216;color:#f3f4f6;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;"><h1>Vite Dev Server is not running</h1><p>Please run <code>npm run dev</code> or compile the project via <code>npm run build</code> first.</p></body></html>');
      }
      req.destroy();
    });
    req.end();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Handle media:// protocol for streaming local files with proper byte-range support for video seeking
  protocol.handle('media', async (request) => {
    let filePath = decodeURIComponent(request.url.slice(8)); // strip "media://"
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    
    try {
      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;
      const range = request.headers.get('range');
      const { Readable } = require('stream');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } else {
        const stream = fs.createReadStream(filePath);
        return new Response(Readable.toWeb(stream), {
          status: 200,
          headers: {
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/mp4',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    } catch (e) {
      console.error('media protocol error:', e);
      return new Response('Not Found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.on('log', (event, msg) => {
  console.log('[RENDERER LOG]', msg);
});

// Select File
ipcMain.handle('select-file', async (event, type) => {
  const filters = type === 'video' 
    ? [{ name: 'Videos', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi'] }]
    : type === 'audio'
    ? [{ name: 'Audios', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'aac'] }]
    : [{ name: 'All Media', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'ogg', 'aac'] }];

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

// Save File Dialog (for exporting)
ipcMain.handle('select-save-path', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Video',
    defaultPath: path.join(app.getPath('videos'), 'exported_video.mp4'),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  });

  if (result.canceled) return null;
  return result.filePath;
});

// Get Media Metadata (ffprobe)
ipcMain.handle('get-metadata', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFfprobePath();
    const args = [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      filePath
    ];

    const proc = child_process.spawn(ffprobePath, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data; });
    proc.stderr.on('data', data => { stderr += data; });

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
      } else {
        try {
          const data = JSON.parse(stdout);
          const format = data.format || {};
          const streams = data.streams || [];
          
          const videoStream = streams.find(s => s.codec_type === 'video');
          const audioStream = streams.find(s => s.codec_type === 'audio');

          let fps = 30;
          if (videoStream && videoStream.avg_frame_rate) {
            const parts = videoStream.avg_frame_rate.split('/');
            if (parts.length === 2 && parseFloat(parts[1]) !== 0) {
              fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
            }
          }

          resolve({
            duration: parseFloat(format.duration || 0),
            width: videoStream ? parseInt(videoStream.width || 0) : 0,
            height: videoStream ? parseInt(videoStream.height || 0) : 0,
            fps,
            hasVideo: !!videoStream,
            hasAudio: !!audioStream
          });
        } catch (e) {
          reject(e);
        }
      }
    });
  });
});

// Extract Audio (ffmpeg)
ipcMain.handle('extract-audio', async (event, filePath) => {
  const tempDir = path.join(app.getPath('temp'), 'simple-editing');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const ext = '.wav';
  const outputName = path.basename(filePath, path.extname(filePath)) + '_' + Date.now() + ext;
  const outputPath = path.join(tempDir, outputName);

  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    const args = [
      '-y',
      '-i', filePath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '2',
      outputPath
    ];

    const proc = child_process.spawn(ffmpegPath, args);

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Audio extraction failed with code ${code}`));
      } else {
        resolve(outputPath);
      }
    });
  });
});

// Generate Video Thumbnails (ffmpeg)
ipcMain.handle('generate-thumbnails', async (event, { filePath, duration }) => {
  const tempDir = path.join(app.getPath('temp'), 'simple-editing');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const uniqueId = Date.now();
  
  // Calculate interval to get ~60 thumbnails across duration
  const interval = Math.max(0.1, duration / 60);
  const outPattern = path.join(tempDir, `thumb_${uniqueId}_%03d.jpg`);
  
  await new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    const args = [
      '-y',
      '-i', filePath,
      '-vf', `fps=1/${interval.toFixed(4)},scale=120:68`,
      outPattern
    ];
    
    console.log('Spawning ffmpeg for thumbnails with args:', args.join(' '));
    const proc = child_process.spawn(ffmpegPath, args);
    
    let stderr = '';
    proc.stderr.on('data', data => { stderr += data.toString(); });
    
    proc.on('close', code => {
      if (code !== 0) {
        console.error('ffmpeg thumbnail generation failed:', stderr);
      }
      resolve();
    });
  });
  
  // Read all files matching the pattern in the temp directory
  try {
    const files = fs.readdirSync(tempDir);
    const prefix = `thumb_${uniqueId}_`;
    const thumbPaths = files
      .filter(f => f.startsWith(prefix) && f.endsWith('.jpg'))
      .sort((a, b) => {
        const numA = parseInt(a.slice(prefix.length, -4), 10);
        const numB = parseInt(b.slice(prefix.length, -4), 10);
        return numA - numB;
      })
      .map(f => path.join(tempDir, f));
      
    console.log(`Generated ${thumbPaths.length} thumbnails for ${filePath}`);
    return thumbPaths;
  } catch (err) {
    console.error('Error reading generated thumbnails:', err);
    return [];
  }
});

// Export Timeline (ffmpeg filter_complex)
ipcMain.handle('export-timeline', async (event, { tracks, clips, outputPath }) => {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    
    // 1. Collect all unique media files to map them to input indices
    const uniqueFiles = [];
    const getFileIndex = (filePath) => {
      let idx = uniqueFiles.indexOf(filePath);
      if (idx === -1) {
        uniqueFiles.push(filePath);
        idx = uniqueFiles.length - 1;
      }
      return idx;
    };

    clips.forEach(clip => getFileIndex(clip.filePath));

    // Calculate total duration for progress parsing (max end time of all clips)
    let totalDuration = clips.length > 0
      ? Math.max(...clips.map(c => c.timelineStart + (c.end - c.start)))
      : 1;

    // Prepare inputs arguments: -i "file1" -i "file2" ...
    const inputArgs = [];
    uniqueFiles.forEach(file => {
      inputArgs.push('-i', file);
    });

    const filterComplex = [];
    
    // --- VIDEO PIPELINE ---
    // Group video clips by track and process in order of tracks to construct overlay layer chain
    let currentBaseLabel = '[v_base]';
    const visibleVideoClips = [];

    tracks.forEach((track) => {
      if (track.type !== 'video' || track.visible === false) return;
      const trackClips = clips.filter(c => c.trackId === track.id);
      visibleVideoClips.push(...trackClips);
    });

    // We start with a black background video base
    filterComplex.push(`color=c=black:s=1920x1080:r=30:d=${totalDuration}[v_base]`);

    if (visibleVideoClips.length > 0) {
      visibleVideoClips.forEach((clip, idx) => {
        const inIdx = getFileIndex(clip.filePath);
        const clipLabel = `[v_clip_${idx}]`;
        const nextBaseLabel = idx === visibleVideoClips.length - 1 ? '[outv]' : `[v_layer_${idx}]`;
        
        // Scale, pad, set fps, trim, and set PTS
        const scaleStr = `[${inIdx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30`;
        const trimStr = `trim=start=${clip.start}:end=${clip.end},setpts=PTS-STARTPTS`;
        filterComplex.push(`${scaleStr},${trimStr}${clipLabel}`);
        
        // Overlay clip on current base
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
      if (!track) return;
      if (track.muted === true) return;
      
      const hasSound = clip.type === 'audio' || (clip.type === 'video' && clip.hasAudio);
      if (hasSound && (clip.volume ?? 1) > 0) {
        allAudioClips.push(clip);
      }
    });

    const audioOutLabels = [];

    if (allAudioClips.length > 0) {
      allAudioClips.forEach((clip, j) => {
        const inIdx = getFileIndex(clip.filePath);
        const label = `[a_raw_${j}]`;
        const volLabel = `[a_vol_${j}]`;
        const delayLabel = `[a_delay_${j}]`;

        // 1. Trim audio
        const atrimStr = `[${inIdx}:a]atrim=start=${clip.start}:end=${clip.end},asetpts=PTS-STARTPTS${label}`;
        filterComplex.push(atrimStr);

        // 2. Volume filter
        const volStr = `${label}volume=${clip.volume}${volLabel}`;
        filterComplex.push(volStr);

        // 3. Delay filter (in milliseconds)
        const delayMs = Math.round(clip.timelineStart * 1000);
        const delayStr = `${volLabel}adelay=delays=${delayMs}:all=1${delayLabel}`;
        filterComplex.push(delayStr);

        audioOutLabels.push(delayLabel);
      });

      // Mix all delayed audio channels
      const mixInputs = audioOutLabels.join('');
      filterComplex.push(`${mixInputs}amix=inputs=${allAudioClips.length}:duration=longest[outa]`);
    } else {
      // If no audio clips, generate silence
      filterComplex.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalDuration}[outa]`);
    }

    // Assemble final args
    const filterComplexStr = filterComplex.join(';');
    const args = [
      '-y',
      ...inputArgs,
      '-filter_complex', filterComplexStr,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputPath
    ];

    console.log('Spawning ffmpeg with args:', args.join(' '));

    const proc = child_process.spawn(ffmpegPath, args);
    
    let stderr = '';

    proc.stderr.on('data', data => {
      const text = data.toString();
      stderr += text;
      
      // Parse progress: time=HH:MM:SS.cs
      const match = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const centiseconds = parseInt(match[4]);
        const currentSeconds = (hours * 3600) + (minutes * 60) + seconds + (centiseconds / 100);
        
        let percent = Math.round((currentSeconds / totalDuration) * 100);
        if (percent > 100) percent = 100;
        if (percent < 0) percent = 0;
        
        event.sender.send('export-progress', percent);
      }
    });

    proc.on('close', code => {
      if (code !== 0) {
        console.error('ffmpeg failed:', stderr);
        reject(new Error(`ffmpeg failed with code ${code}. Check logs for details.`));
      } else {
        resolve(outputPath);
      }
    });
  });
});
