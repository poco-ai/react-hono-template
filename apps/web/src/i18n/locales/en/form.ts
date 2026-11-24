const form = {
	errors: {
		required: "This field is required.",
		email: "Enter a valid email address.",
		passwordMin: "Password must be at least {{count}} characters.",
		slugPattern: "Use only lowercase letters, numbers and hyphens.",
		identifierPattern: "Key must be 2–6 uppercase letters.",
		url: "Enter a valid URL (https, or http for localhost).",
		maxLength: "Must be at most {{count}} characters.",
		minLength: "Must be at least {{count}} characters.",
		min: "Must be at least {{count}}.",
		max: "Must be at most {{count}}.",
		invalidFormat: "Enter a valid value.",
		invalidValue: "Choose a valid option.",
		invalidNumber: "Enter a valid number.",
	},
};

export default form;
