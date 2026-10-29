// 衝突檢查整合測試：需要 MongoDB replica set（交易需要）
// MONGODB_TEST_URI=mongodb://localhost:27017/?replicaSet=rs0 deno task test:integration
// 未設定 MONGODB_TEST_URI 時會略過
import { assert, assertEquals } from "@std/assert";
import { type Collection, type Document, MongoClient } from "mongodb";

const TEST_URI = Deno.env.get("MONGODB_TEST_URI");
const DB_NAME = `conflict_test_${Date.now()}`;

// 只回傳有用到的欄位，讓 handler 可以直接呼叫
// deno-lint-ignore no-explicit-any
type Ctx = any;
function ctx(body: unknown, params: Record<string, string> = {}): Ctx {
  return {
    params,
    request: { body: { json: () => Promise.resolve(body) }, url: new URL("http://x/api/bookings") },
    response: {},
  };
}

const T = (hm: string) => `2026-12-01T${hm}:00.000Z`;
const ms = (v: unknown) => new Date(v as string).getTime();

Deno.test({
  name: "衝突檢查（整合測試）",
  ignore: !TEST_URI,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    Deno.env.set("ENV", "production");
    Deno.env.set("MONGODB_URI", TEST_URI!);
    Deno.env.set("DB_NAME", DB_NAME);
    Deno.env.set("LOG_LEVEL", "error");
    const { addBooking, updateBooking } = await import("./controller.ts");

    const client = new MongoClient(TEST_URI!);
    await client.connect();
    const db = client.db(DB_NAME);
    const booked: Collection<Document> = db.collection("booked");
    await db.collection("users").insertOne({
      id: "001234",
      name: "測試員",
      extension: "51164",
      department: { code: "D", label: "資訊部" },
      group: { code: "G", label: "開發組" },
    });

    let seq = 0;
    async function add(rooms: string | string[], s: string, e: string, title = `b${++seq}`) {
      const c = ctx({
        title,
        user: "1234",
        room: Array.isArray(rooms) ? rooms : [rooms],
        participantsNum: 2,
        startTime: T(s),
        endTime: T(e),
        editPassword: "",
      });
      await addBooking(c);
      return c.response.status as number;
    }
    // 與前端修改視窗送出的內容相同；可指定同組中的某一間
    async function edit(title: string, patch: { room?: string; s?: string; e?: string; of?: string }) {
      const doc = await booked.findOne({ title, cancelled: false, ...(patch.of ? { room: patch.of } : {}) });
      assert(doc, `找不到預約 ${title}`);
      const c = ctx({
        title,
        participantsNum: 2,
        room: patch.room ?? doc.room,
        date: "2026-12-01",
        startTime: patch.s ? T(patch.s) : new Date(doc.startTime).toISOString(),
        endTime: patch.e ? T(patch.e) : new Date(doc.endTime).toISOString(),
      }, { id: doc.id, editPassword: "" });
      await updateBooking(c);
      return c.response.status as number;
    }
    async function cancel(title: string) {
      const doc = await booked.findOne({ title, cancelled: false });
      const c = ctx({ cancelled: true }, { id: doc!.id, editPassword: "" });
      await updateBooking(c);
      return c.response.status as number;
    }
    // 舊版 PATCH 會把時間存成 ISO 字串，直接寫入模擬正式資料中修改過的預約
    async function addLegacyEdited(room: string, s: string, e: string, title: string) {
      await booked.insertOne({
        id: crypto.randomUUID(),
        createdTime: new Date(),
        title,
        user: {
          id: "001234",
          name: "測試員",
          extension: "",
          department: { code: "", label: "" },
          group: { code: "", label: "" },
        },
        room,
        participantsNum: 2,
        cancelled: false,
        startTime: T(s),
        endTime: T(e),
        editPassword: "",
        updatedCount: 1,
        date: "2026-12-01",
        isMulti: [],
      });
    }
    // 同一會議室、未取消、時間重疊的組數（Date 與字串都換算成時間）
    async function countOverlaps() {
      const docs = await booked.find({ cancelled: false }).toArray();
      let n = 0;
      for (let i = 0; i < docs.length; i++) {
        for (let j = i + 1; j < docs.length; j++) {
          const a = docs[i], b = docs[j];
          if (a.room === b.room && ms(a.startTime) < ms(b.endTime) && ms(b.startTime) < ms(a.endTime)) n++;
        }
      }
      return n;
    }
    async function step(name: string, fn: () => Promise<void>) {
      await t.step(name, async () => {
        await booked.deleteMany({});
        await fn();
      });
    }

    const probes: [string, string, string, number][] = [
      ["完全相同", "10:00", "11:00", 400],
      ["後段重疊", "10:30", "11:30", 400],
      ["前段重疊", "09:30", "10:30", 400],
      ["被包含", "10:15", "10:45", 400],
      ["完全包住", "09:00", "12:00", 400],
      ["只重疊 1 分鐘", "10:59", "11:30", 400],
      ["緊接在後", "11:00", "12:00", 201],
      ["緊接在前", "09:00", "10:00", 201],
    ];

    for (const [name, s, e, want] of probes) {
      await step(`新增 vs 一般預約：${name}`, async () => {
        await add("A101", "10:00", "11:00", "base");
        assertEquals(await add("A101", s, e), want);
      });
    }
    await step("新增 vs 一般預約：不同會議室同時段可預約", async () => {
      await add("A101", "10:00", "11:00", "base");
      assertEquals(await add("A102", "10:00", "11:00"), 201);
    });
    await step("新增 vs 一般預約：已取消的時段可再預約", async () => {
      await add("A101", "10:00", "11:00", "base");
      assertEquals(await cancel("base"), 200);
      assertEquals(await add("A101", "10:00", "11:00"), 201);
    });

    // 正式資料中曾發生：預約被修改過（時間變成字串）後，別人可以重複預約
    for (const [name, s, e, want] of probes) {
      await step(`新增 vs 舊版修改過（字串時間）的預約：${name}`, async () => {
        await addLegacyEdited("A101", "10:00", "11:00", "base");
        assertEquals(await add("A101", s, e), want);
      });
    }
    for (const [name, s, e, want] of probes) {
      await step(`新增 vs 新版修改過的預約：${name}`, async () => {
        await add("A101", "08:00", "09:00", "base");
        assertEquals(await edit("base", { s: "10:00", e: "11:00" }), 200);
        assertEquals(await add("A101", s, e), want);
      });
    }

    await step("修改：自己、時間不變", async () => {
      await add("A101", "10:00", "11:00", "base");
      assertEquals(await edit("base", {}), 200);
    });
    await step("修改：自己、與原時段重疊", async () => {
      await add("A101", "10:00", "11:00", "base");
      assertEquals(await edit("base", { s: "10:30", e: "11:30" }), 200);
    });
    await step("修改：改到別人的時段", async () => {
      await add("A101", "10:00", "11:00", "base");
      await add("A101", "13:00", "14:00", "x");
      assertEquals(await edit("x", { s: "10:30", e: "11:30" }), 400);
    });
    await step("修改：改到舊版修改過（字串時間）的時段", async () => {
      await addLegacyEdited("A101", "10:00", "11:00", "base");
      await add("A101", "13:00", "14:00", "x");
      assertEquals(await edit("x", { s: "10:30", e: "11:30" }), 400);
    });
    await step("修改：舊版修改過的預約再修改，與自己原時段重疊", async () => {
      await addLegacyEdited("A101", "10:00", "11:00", "base");
      assertEquals(await edit("base", { s: "10:30", e: "11:30" }), 200);
      const doc = await booked.findOne({ title: "base" });
      assert(doc!.startTime instanceof Date, "修改後應存成 Date");
    });
    await step("修改：換到已被佔用的會議室", async () => {
      await add("A101", "10:00", "11:00", "base");
      await add("A102", "10:00", "11:00", "x");
      assertEquals(await edit("x", { room: "A101" }), 400);
    });

    await step("多會議室：其中一間衝突 → 整筆不寫入", async () => {
      await add("A102", "10:00", "11:00", "base");
      assertEquals(await add(["A101", "A102"], "10:00", "11:00", "multi"), 400);
      assertEquals(await booked.countDocuments({ room: "A101", cancelled: false }), 0);
    });
    await step("多會議室：修改同組時間撞到另一間的預約", async () => {
      await add(["A101", "A102"], "13:00", "14:00", "multi");
      await add("A102", "10:00", "11:00", "y");
      assertEquals(await edit("multi", { of: "A101", s: "10:00", e: "11:00" }), 400);
      assertEquals(await countOverlaps(), 0);
    });
    await step("多會議室：同組互相不算衝突，修改後兩間一起移動", async () => {
      await add(["A101", "A102"], "13:00", "14:00", "multi");
      assertEquals(await edit("multi", { of: "A101", s: "13:30", e: "14:30" }), 200);
      const docs = await booked.find({ title: "multi" }).toArray();
      assert(docs.every((d) => new Date(d.startTime).toISOString() === T("13:30")));
    });

    await step("同時送出：20 個相同時段", async () => {
      const st = await Promise.all(Array.from({ length: 20 }, () => add("A101", "10:00", "11:00")));
      assertEquals(st.filter((s) => s === 201).length, 1);
    });
    await step("同時送出：10 個互相重疊的不同時段", async () => {
      const slots: [string, string][] = [
        ["10:00", "11:00"],
        ["10:30", "11:30"],
        ["10:45", "12:00"],
        ["09:30", "10:50"],
        ["10:10", "10:50"],
        ["10:20", "11:10"],
        ["09:50", "10:55"],
        ["10:05", "11:45"],
        ["10:35", "10:50"],
        ["10:25", "10:46"],
      ];
      const st = await Promise.all(slots.map(([s, e]) => add("A101", s, e)));
      assertEquals(st.filter((s) => s === 201).length, 1);
      assertEquals(await countOverlaps(), 0);
    });
    await step("同時送出：3 組多會議室互相共用一間", async () => {
      const st = await Promise.all([
        add(["A101", "A102"], "10:00", "11:00"),
        add(["A102", "A103"], "10:00", "11:00"),
        add(["A103", "A101"], "10:00", "11:00"),
      ]);
      assertEquals(st.filter((s) => s === 201).length, 1);
      assertEquals(await countOverlaps(), 0);
    });
    await step("同時送出：兩筆預約同時改到同一個空時段", async () => {
      await add("A101", "13:00", "14:00", "p");
      await add("A101", "15:00", "16:00", "q");
      const st = await Promise.all([edit("p", { s: "10:00", e: "11:00" }), edit("q", { s: "10:00", e: "11:00" })]);
      assertEquals(st.filter((s) => s === 200).length, 1);
      assertEquals(await countOverlaps(), 0);
    });
    await step("同時送出：新增與修改搶同一時段", async () => {
      await add("A101", "13:00", "14:00", "p");
      const [a, e] = await Promise.all([add("A101", "10:00", "11:00"), edit("p", { s: "10:00", e: "11:00" })]);
      assertEquals((a === 201 ? 1 : 0) + (e === 200 ? 1 : 0), 1);
      assertEquals(await countOverlaps(), 0);
    });
    await step("壓力測試：150 筆隨機新增／修改分批同時送出後沒有重疊", async () => {
      const rooms = ["A101", "A102", "A103"];
      const rnd = (n: number) => Math.floor(Math.random() * n);
      const hm = (min: number) =>
        `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      await addLegacyEdited("A102", "12:00", "13:00", "legacy");
      for (let batch = 0; batch < 5; batch++) {
        const titles = (await booked.find({ cancelled: false }).project({ title: 1 }).toArray()).map((d) =>
          d.title as string
        );
        await Promise.all(Array.from({ length: 30 }, () => {
          const start = 9 * 60 + rnd(16) * 30;
          const [s, e] = [hm(start), hm(start + 30 * (1 + rnd(4)))];
          if (titles.length > 0 && Math.random() < 0.4) {
            return edit(titles[rnd(titles.length)], { s, e, room: rooms[rnd(3)] }).catch(() => 0);
          }
          const rs = Math.random() < 0.3 ? [rooms[rnd(3)], rooms[rnd(3)]] : [rooms[rnd(3)]];
          return add([...new Set(rs)], s, e);
        }));
      }
      assertEquals(await countOverlaps(), 0);
    });

    await db.dropDatabase();
    await client.close();
  },
});
