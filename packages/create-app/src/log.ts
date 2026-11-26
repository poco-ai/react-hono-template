import * as p from "@clack/prompts";

const started = Date.now();

const elapsed = () => {
	const seconds = (Date.now() - started) / 1000;
	return `${seconds.toFixed(1)}s`;
};

/**
 * Pipeline logging. clack's log renders the familiar framed lines and
 * disables colors automatically when stdout is not a TTY, so CI output
 * stays plain.
 */
export const log = {
	step(message: string): void {
		p.log.step(`${message} (${elapsed()})`);
	},
	info(message: string): void {
		p.log.info(message);
	},
	warn(message: string): void {
		p.log.warn(message);
	},
	error(message: string): void {
		p.log.error(message);
	},
};
