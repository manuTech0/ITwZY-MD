import pino, { transport } from "pino";
import { ENV } from "../configs/env";

const isProd = ENV.NODE_ENV === "production";
const commonPinoOptions = {
	colorize: true,
	translateTIme: "iso",
	ignore: "pid,hostname",
	singleline: false,
};
export const logger = pino(
	transport({
		targets: isProd
			? [
					{
						level: "info",
						target: "pino-pretty",
					},
				]
			: [
					{
						level: "debug",
						target: "pino-pretty",
						options: {
							...commonPinoOptions,
						},
					},
				],
	}),
);
