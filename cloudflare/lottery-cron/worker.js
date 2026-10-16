// lottery-cron：Cloudflare 定時觸發器（2026-10-17 單一 Cron 版）
// 時間一到，就叫 GitHub 上的 Lottery-scraper 爬蟲開始抓（GitHub 自己的排程常延遲好幾小時）。
// 需要的密鑰：GH_TOKEN（只給 Lottery-scraper 的 Actions: Read and write）
// Cron 時間是 UTC（台灣時間 = UTC + 8）

const REPO = "redwinds542688-gif/Lottery-scraper";

// 2026-10-17 改成只用 1 條 Cron（Cloudflare 免費方案每個帳號最多 5 條，空出名額）
// Cloudflare 只要設定這一條：  0,40,45 2,3,12,13 * * *
// 它每天會在 UTC 2/3/12/13 點的 0、40、45 分各叫醒一次（共 12 次），
// 程式依「實際觸發時間」查下表，有對應的才叫爬蟲，其他時間直接結束（不花任何費用）。
// 時間是 UTC（台灣時間 = UTC + 8）
// la: "dst" = 只在美國加州夏令時間觸發；"std" = 只在冬令時間觸發；沒寫 = 每天都觸發
const CRON = "0,40,45 2,3,12,13 * * *";
const MAP = {
  "12:45": { wf: "scrape-539.yml" },                   // 台灣 20:45 今彩539
  "13:00": { wf: "scrape-lotto649.yml" },              // 台灣 21:00 大樂透（非開獎日程式會自己很快結束）
  "13:40": { wf: "scrape-marksix.yml" },               // 台灣 21:40 香港六合彩
  "02:00": { wf: "scrape-fantasy5.yml", la: "dst" },   // 台灣 10:00 加州天天樂（夏令時間）
  "03:00": { wf: "scrape-fantasy5.yml", la: "std" },   // 台灣 11:00 加州天天樂（冬令時間）
};

// 自動判斷「現在」加州是不是夏令時間（PDT，UTC-7）；冬令是 PST（UTC-8）
function isCaliforniaDST(date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    const laHour = Number(parts.find((p) => p.type === "hour").value);
    let off = laHour - date.getUTCHours();
    if (off > 12) off -= 24;
    if (off < -12) off += 24;
    return off === -7;
  } catch (e) {
    // 備用：美國規則——3 月第 2 個星期日 ~ 11 月第 1 個星期日（當地凌晨 2 點切換，約 UTC 10 點／9 點）
    const y = date.getUTCFullYear();
    const nthSunday = (m, n) => {
      const d = new Date(Date.UTC(y, m, 1));
      const first = (7 - d.getUTCDay()) % 7;
      return 1 + first + 7 * (n - 1);
    };
    const start = Date.UTC(y, 2, nthSunday(2, 2), 10);
    const end = Date.UTC(y, 10, nthSunday(10, 1), 9);
    return date.getTime() >= start && date.getTime() < end;
  }
}

async function dispatch(env, wf) {
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${wf}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "lottery-cron",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  // 成功會是 204
  console.log(wf, r.status, await r.text());
  return r.status;
}

export default {
  async scheduled(event, env, ctx) {
    const t = new Date(event.scheduledTime);
    const hm = String(t.getUTCHours()).padStart(2, "0") + ":" + String(t.getUTCMinutes()).padStart(2, "0");
    const job = MAP[hm];
    if (!job) {
      console.log("這個時間沒有要觸發的爬蟲：UTC", hm);
      return;
    }
    if (job.la) {
      const dst = isCaliforniaDST(new Date(event.scheduledTime));
      if ((job.la === "dst") !== dst) {
        console.log(job.wf, "跳過：加州現在是", dst ? "夏令" : "冬令", "時間，不是這個時段");
        return;
      }
    }
    ctx.waitUntil(dispatch(env, job.wf));
  },
  async fetch() {
    const dst = isCaliforniaDST(new Date());
    return new Response("lottery-cron 運作中｜加州現在是" + (dst ? "夏令時間（天天樂 10:00 觸發）" : "冬令時間（天天樂 11:00 觸發）"));
  },
};
