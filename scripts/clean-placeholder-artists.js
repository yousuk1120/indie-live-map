// 라인업에서 아티스트가 아닌 자리표시 토큰을 제거합니다.
// 예: "70 ARTISTS", "TBA", "AND MORE", "MORE TBA", "외 다수", "and more!" 등.
// 사용법: node scripts/clean-placeholder-artists.js
const { loadEnv, initAdmin } = require("./_lib");

const PLACEHOLDER = /^(?:\d+\s*ARTISTS?|TBA|AND MORE|MORE TBA|COMING SOON|외\s*다수|그\s*외\s*다수|및\s*다수|more|and more!?|\.\.\.|…)$/i;

function splitArtists(v) {
  return String(v || "").split(/[,/|·]+/).map((a) => a.trim()).filter(Boolean);
}
function clean(v) {
  return splitArtists(v).filter((a) => !PLACEHOLDER.test(a)).join(", ");
}

async function main() {
  const env = loadEnv();
  const admin = initAdmin(env);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  const snap = await db.collection("events").get();
  let changed = 0;
  for (const d of snap.docs) {
    const ev = d.data();
    const newArtists = clean(ev.artistNames);
    const newDayLineups = (ev.dayLineups || []).map((x) => ({ date: x.date, artists: clean(x.artists) })).filter((x) => x.artists);

    const artistsChanged = newArtists !== (ev.artistNames || "").trim() && newArtists !== ev.artistNames;
    const dayChanged = JSON.stringify(newDayLineups) !== JSON.stringify(ev.dayLineups || []);
    if (!artistsChanged && !dayChanged) continue;

    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (artistsChanged) update.artistNames = newArtists;
    if (dayChanged) update.dayLineups = newDayLineups;
    await db.collection("events").doc(d.id).update(update);
    changed++;
    console.log(`정리: "${ev.title}" → ${newArtists.slice(0, 120)}`);
  }
  console.log(`\n완료: ${changed}개 정리.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
