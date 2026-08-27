import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { messageSendQueue } from "./infra/queue";
import { getRedis } from "./infra/redis";
import { validatePhoneNumber } from "./utils/phoneValidator";

const DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;

function readNumbers(hpPath: string): string[] {
	return readFileSync(hpPath, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function readMessage(msgPath: string): string {
	const message = readFileSync(msgPath, "utf8").trim();
	if (!message) {
		throw new Error("msg.txt kosong");
	}
	return message;
}

export async function enqueueBroadcastFromFiles(
	hpPath = "hp.txt",
	msgPath = "msg.txt",
): Promise<{ queued: number; total: number }> {
	const message = readMessage(msgPath);
	const rawNumbers = readNumbers(hpPath);

	console.log(`membaca ${rawNumbers.length} baris dari ${hpPath}`);

	const fingerprint = createHash("sha256")
		.update(rawNumbers.join("\n"))
		.update(message)
		.digest("hex");

	const claimed = await getRedis().set(
		`broadcast:sent:${fingerprint}`,
		new Date().toISOString(),
		"EX",
		DEDUPE_TTL_SECONDS,
		"NX",
	);

	if (!claimed) {
		console.log("broadcast dengan isi sama sudah pernah dikirim, skip");
		return { queued: 0, total: rawNumbers.length };
	}

	const validNumbers: { raw: string; formatted: string }[] = [];
	for (const raw of rawNumbers) {
		const phone = validatePhoneNumber(raw);
		if (!phone.valid) {
			console.warn(`skip nomor tidak valid: ${raw} (${phone.error})`);
			continue;
		}
		validNumbers.push({ raw, formatted: phone.formatted });
	}

	const total = validNumbers.length;
	let queued = 0;

	for (const { raw, formatted } of validNumbers) {
		await messageSendQueue.add("message.send", {
			no_hp: formatted,
			message,
			index: queued + 1,
			total,
			rawNumber: raw,
		});

		queued++;
		console.log(`queued: ${formatted}`);
	}

	console.log(`selesai: ${queued}/${total} nomor masuk queue`);
	return { queued, total };
}

async function main() {
	await enqueueBroadcastFromFiles();
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
