import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { getDb } from "../infra/db";
import { validatePhoneNumber } from "../utils/phoneValidator";

function readNumbers(hpPath: string): string[] {
	return readFileSync(hpPath, "utf8")
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
}

function readMessage(msgPath: string): string {
	const msg = readFileSync(msgPath, "utf8").trim();
	if (!msg) throw new Error("msg.txt kosong");
	return msg;
}

export interface CampaignResult {
	campaignId: string;
	name: string;
	total: number;
	queued: number;
	skipped: number;
}

export async function createCampaign(
	hpPath = "hp.txt",
	msgPath = "msg.txt",
): Promise<CampaignResult> {
	const message = readMessage(msgPath);
	const rawNumbers = readNumbers(hpPath);
	const db = getDb();

	const now = new Date().toISOString();
	const dateSlug = now.slice(0, 10);
	const campaignId = randomUUID();
	const name = `broadcast-${dateSlug}`;

	db.prepare(
		`INSERT INTO campaigns (id, name, message, status, created_at, updated_at)
		 VALUES (?, ?, ?, 'queued', ?, ?)`,
	).run(campaignId, name, message, now, now);

	const insert = db.prepare(
		`INSERT INTO campaign_recipients (id, campaign_id, phone, status, created_at)
		 VALUES (?, ?, ?, 'pending', ?)`,
	);

	let queued = 0;
	let skipped = 0;

	const insertMany = db.transaction((numbers: string[]) => {
		for (const raw of numbers) {
			const validated = validatePhoneNumber(raw);
			if (!validated.valid) {
				console.warn(`skip nomor tidak valid: ${raw} (${validated.error})`);
				skipped++;
				continue;
			}
			insert.run(randomUUID(), campaignId, validated.formatted, now);
			queued++;
		}
	});

	insertMany(rawNumbers);

	db.prepare(`UPDATE campaigns SET total = ?, updated_at = ? WHERE id = ?`).run(
		queued,
		now,
		campaignId,
	);

	console.log(`campaign "${name}" dibuat: ${queued} nomor, ${skipped} skip`);
	return { campaignId, name, total: queued, queued, skipped };
}
