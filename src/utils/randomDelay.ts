export function randomDelay(minMs = 3000, maxMs = 7000): Promise<void> {
	const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
	return new Promise((resolve) => setTimeout(resolve, ms));
}
