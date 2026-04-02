export interface MediaItem {
  id: number;
  filename: string;
  type: 'photo' | 'video';
  is_new: boolean;
  is_favorite: boolean;
  file_size: number | null;
  downloaded_at: string | null;
  camera_meta: string | null;
}

export type FilterType = 'all' | 'photo' | 'video';

export interface SyncStatus {
  running: boolean;
  last_sync_at: string | null;
  last_synced_id: number;
  new_count: number;
  interval_minutes: number;
  auto_enabled: boolean;
}

export interface Settings {
  camera_ip: string;
  camera_port: number;
  sync_interval_minutes: number;
  auto_sync_enabled: boolean;
  bt_mac_address: string;
  wifi_adapter?: string;
  wifi_ssid: string;
  wifi_password?: string;
  use_native_thumbnails?: boolean;
  immich_enabled?: boolean;
  immich_server_url?: string;
  immich_api_key?: string;
  immich_album_name?: string;
}

export interface CameraStatus {
  brand?: string;
  model?: string;
  product?: string;
  ver?: string;
  voltage?: number;
  vol_value?: number;
  temperature?: number;
  ext_power?: number;
  solar_voltage?: number;
  clock?: string;
  tz?: string;
  irStatus?: string;
  irPower?: number;
  DayNightMode?: string;
}

export interface LogEntry {
  ts: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  msg: string;
}
