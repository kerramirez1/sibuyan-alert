const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'src');

const map = {
  HiOutlineMail: 'Mail',
  HiOutlineLockClosed: 'Lock',
  HiOutlineExclamation: 'AlertCircle',
  HiOutlineArrowRight: 'ArrowRight',
  HiOutlineArrowLeft: 'ArrowLeft',
  HiOutlineEye: 'Eye',
  HiOutlineEyeOff: 'EyeOff',
  HiOutlineGlobe: 'Globe',
  HiOutlineCheckCircle: 'CircleCheck',
  HiOutlineUserAdd: 'UserPlus',
  HiOutlineMap: 'Map',
  HiOutlineShieldCheck: 'ShieldCheck',
  HiOutlineBell: 'Bell',
  HiOutlineUserGroup: 'Users',
  HiOutlineUsers: 'Users',
  HiOutlineLocationMarker: 'MapPin',
  HiOutlineLightningBolt: 'Zap',
  HiOutlineChartBar: 'BarChart3',
  HiOutlineDocumentText: 'FileText',
  HiOutlineClipboardCheck: 'ClipboardCheck',
  HiOutlineClipboardList: 'ClipboardList',
  HiOutlineClock: 'Clock',
  HiOutlineCalendar: 'Calendar',
  HiOutlineSearch: 'Search',
  HiOutlineChevronDown: 'ChevronDown',
  HiOutlineChevronRight: 'ChevronRight',
  HiOutlineArchive: 'Archive',
  HiOutlineFilter: 'Filter',
  HiOutlinePhotograph: 'Image',
  HiOutlineBadgeCheck: 'BadgeCheck',
  HiOutlineHome: 'House',
  HiOutlineX: 'X',
  HiX: 'X',
  HiDownload: 'Download',
  HiOutlineOfficeBuilding: 'Building2',
  HiOutlineStatusOnline: 'Radio',
  HiOutlineLogin: 'LogIn',
  HiOutlineLogout: 'LogOut',
  HiOutlineMenu: 'Menu',
  HiOutlineUserCircle: 'CircleUser',
  HiOutlineUser: 'User',
  HiOutlineIdentification: 'IdCard',
  HiOutlineCheck: 'Check',
  HiOutlineCloudUpload: 'CloudUpload',
  HiOutlineCamera: 'Camera',
  HiOutlineRefresh: 'RefreshCw',
  HiOutlineXCircle: 'CircleX',
  HiOutlineInbox: 'Inbox',
  HiOutlineKey: 'Key',
  HiOutlineInformationCircle: 'Info',
  HiOutlineTruck: 'Truck',
  HiOutlineFire: 'Flame',
  HiOutlineShieldExclamation: 'ShieldAlert',
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function replaceAllWord(content, from, to) {
  return content.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
}

const files = walk(ROOT);
let touched = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  for (const [from, to] of Object.entries(map)) {
    content = replaceAllWord(content, from, to);
  }

  content = content
    .replace(/from\s+['"]react-icons\/hi['"]/g, "from 'lucide-react'")
    .replace(/from\s+['"]react-icons\/hi2['"]/g, "from 'lucide-react'");

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    touched++;
  }
}

console.log(`Updated ${touched} files.`);
