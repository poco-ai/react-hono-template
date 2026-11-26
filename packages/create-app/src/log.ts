const started = Date.now();

const elapsed = () => {
	const seconds = (Date.now() - started) / 1000;
	return `${seconds.toFixed(1)}s`;
};

export const log = {
	step(message: string): void {
		console.log(`\n[create-app ${elapsed()}] ${message}`);
	},
	info(message: string): void {
		console.log(`  - ${message}`);
	},
	warn(message: string): void {
		console.warn(`  ! ${message}`);
	},
	error(message: string): void {
		console.error(`  x ${message}`);
	},
};
