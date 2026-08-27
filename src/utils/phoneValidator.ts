export function validatePhoneNumber(phone: string): {
	valid: boolean;
	formatted: string;
	error?: string;
	details?: {
		countryCode: string;
		operatorCode: string;
		subscriberNumber: string;
		totalDigits: number;
	};
} {
	// Hapus non-digit
	const cleaned = phone.replace(/\D/g, "");

	let formatted = cleaned;

	// Normalize format
	if (formatted.startsWith("0")) {
		formatted = `62${formatted.slice(1)}`;
	} else if (!formatted.startsWith("62")) {
		formatted = `62${formatted}`;
	}

	// Validasi panjang
	const numberPart = formatted.slice(2);
	if (numberPart.length < 6 || numberPart.length > 11) {
		return {
			valid: false,
			formatted,
			error: `Invalid length: ${numberPart.length} digits (expected 9-11)`,
		};
	}

	// Extract details
	const countryCode = formatted.slice(0, 2);
	const operatorCode = formatted.slice(2, 4);
	const subscriberNumber = formatted.slice(4);

	return {
		valid: true,
		formatted,
		details: {
			countryCode,
			operatorCode,
			subscriberNumber,
			totalDigits: formatted.length,
		},
	};
}
