const fs = require('fs');
let content = fs.readFileSync('app/admin/page.tsx', 'utf-8');
content = content.replace(/text-white\/20/g, 'text-[var(--faint)]')
                 .replace(/text-white\/30/g, 'text-[var(--muted)]')
                 .replace(/text-white\/40/g, 'text-[var(--muted)]')
                 .replace(/text-white/g, 'text-[var(--text)]')
                 .replace(/bg-white\/5/g, 'bg-[var(--panel-2)]')
                 .replace(/bg-white\/10/g, 'bg-[var(--panel-3)]')
                 .replace(/bg-white\/\[0\.03\]/g, 'bg-[var(--panel-2)]')
                 .replace(/bg-white\/\[0\.05\]/g, 'bg-[var(--panel-3)]')
                 .replace(/border-white\/\[0\.03\]/g, 'border-[var(--line)]');
fs.writeFileSync('app/admin/page.tsx', content);
console.log('Fixed theme classes in app/admin/page.tsx');
