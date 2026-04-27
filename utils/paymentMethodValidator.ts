export interface ValidationResult {
  is_valid: boolean;
  missing_fields: string[];
}

export function validatePaymentMethodConfig(method: {
  method_type: string;
  account_info: any;
  logo_url: string | null;
  instructions_vi: string | null;
}): ValidationResult {
  const missing: string[] = [];

  // logo_url and instructions_vi are optional — admin can activate without them.
  // Only account_info fields specific to method_type are required.
  const info = method.account_info ?? {};

  switch (method.method_type) {
    case 'bank':
      if (!info.account_number) missing.push('account_info.account_number');
      if (!info.account_name)   missing.push('account_info.account_name');
      if (!info.bank_name)      missing.push('account_info.bank_name');
      break;

    case 'ewallet':
      if (!info.phone_number) missing.push('account_info.phone_number');
      if (!info.account_name) missing.push('account_info.account_name');
      if (!info.qr_image_url) missing.push('account_info.qr_image_url');
      break;

    case 'card':
    case 'international':
      if (!info.merchant_id) missing.push('account_info.merchant_id');
      break;
  }

  return { is_valid: missing.length === 0, missing_fields: missing };
}
