ALTER TABLE video_processing_attempts ADD COLUMN progress_stage TEXT
  CHECK (progress_stage IS NULL OR progress_stage IN (
    'waiting_for_processor',
    'downloading',
    'inspecting',
    'analyzing_audio',
    'transcoding',
    'checking_output',
    'correcting_loudness',
    'finalizing',
    'uploading'
  ));
ALTER TABLE video_processing_attempts ADD COLUMN progress_percent INTEGER
  CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100);
