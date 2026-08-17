/**
 * Blob → base64, for email attachments.
 *
 * Chunked deliberately. `String.fromCharCode(...bytes)` on a whole PDF spreads
 * hundreds of thousands of arguments onto the call stack and throws
 * "Maximum call stack size exceeded" — on the LARGER documents only, so the
 * naive version passes every small test and fails on the real one.
 *
 * Lives here rather than beside either caller because the fee receipt and the
 * payslip both attach a generated PDF to a Brevo email, and two copies of this
 * would eventually be two different chunk sizes.
 */
export const blobToBase64 = async (blob: Blob): Promise<string> => {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};
