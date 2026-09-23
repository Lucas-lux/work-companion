'use strict';

// mode : 'block' = toujours fermé, 'focus' = fermé pendant une session focus, 'track' = juste compté comme distraction
const DEFAULT_RULES = [
  { id: 'yt-shorts', type: 'site', label: 'YouTube Shorts', pattern: 'youtube.com/shorts', keywords: ['#shorts'], mode: 'block', enabled: true },
  { id: 'tiktok', type: 'site', label: 'TikTok', pattern: 'tiktok.com', keywords: ['tiktok'], mode: 'block', enabled: true },
  { id: 'ig-reels', type: 'site', label: 'Instagram Reels', pattern: 'instagram.com/reel', keywords: [], mode: 'block', enabled: true },
  { id: 'fb-reels', type: 'site', label: 'Facebook Reels', pattern: 'facebook.com/reel', keywords: [], mode: 'block', enabled: true },
  { id: 'instagram', type: 'site', label: 'Instagram', pattern: 'instagram.com', keywords: ['instagram'], mode: 'focus', enabled: true },
  { id: 'facebook', type: 'site', label: 'Facebook', pattern: 'facebook.com', keywords: ['facebook'], mode: 'focus', enabled: true },
  { id: 'x', type: 'site', label: 'X / Twitter', pattern: 'x.com, twitter.com', keywords: [' / x', 'twitter'], mode: 'focus', enabled: true },
  { id: 'reddit', type: 'site', label: 'Reddit', pattern: 'reddit.com', keywords: ['reddit'], mode: 'focus', enabled: true },
  { id: 'netflix', type: 'site', label: 'Netflix', pattern: 'netflix.com', keywords: ['netflix'], mode: 'focus', enabled: true },
  { id: 'twitch', type: 'site', label: 'Twitch', pattern: 'twitch.tv', keywords: ['twitch'], mode: 'focus', enabled: true },
  { id: 'youtube', type: 'site', label: 'YouTube', pattern: 'youtube.com', keywords: ['youtube'], mode: 'track', enabled: true },
  { id: 'steam', type: 'app', label: 'Steam', pattern: 'steam, steamwebhelper', keywords: [], mode: 'focus', enabled: true },
];

const DEFAULT_SETTINGS = {
  catName: 'Mochi',
  coat: 'orange',
  companionVisible: true,
  wander: true,
  blockingEnabled: true,
  graceSeconds: 4,
  idleSeconds: 120,
  dailyGoalMinutes: 240,
  focusMinutes: 25,
  breakMinutes: 5,
  autoBreak: true,
  breakReminders: true,
  dndOnFocus: true,
  quitAppsOnFocus: ['discord', 'whatsapp', 'telegram'],
  macFocusOn: '',
  macFocusOff: '',
  launchAtLogin: true,
  bridgePort: 17345,
  productiveApps: [
    'code', 'cursor', 'windsurf', 'zed', 'idea64', 'idea', 'pycharm64', 'pycharm', 'webstorm64', 'webstorm',
    'rider64', 'clion64', 'goland64', 'phpstorm64', 'studio64', 'android studio', 'xcode', 'sublime_text',
    'sublime text', 'notepad++', 'devenv', 'windowsterminal', 'terminal', 'iterm2', 'warp', 'powershell',
    'pwsh', 'cmd', 'figma', 'winword', 'microsoft word', 'excel', 'microsoft excel', 'powerpnt',
    'microsoft powerpoint', 'onenote', 'notion', 'obsidian', 'claude', 'docker desktop', 'postman',
    'blender', 'photoshop', 'illustrator', 'unity', 'godot', 'soffice', 'libreoffice',
  ],
  productiveSites: [
    'github.com', 'gitlab.com', 'stackoverflow.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com',
    'drive.google.com', 'notion.so', 'figma.com', 'claude.ai', 'chatgpt.com', 'developer.mozilla.org',
    'localhost', '127.0.0.1', 'vercel.com', 'linear.app', 'atlassian.net', 'trello.com', 'miro.com',
    'canva.com', 'overleaf.com', 'npmjs.com', 'learn.microsoft.com',
  ],
};

module.exports = { DEFAULT_RULES, DEFAULT_SETTINGS };
