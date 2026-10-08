// Redact credentials before diagnostics leave the server or reach log files.
export function redact(message) {
  let text = String(message ?? '').replace(/[\r\n\u0000-\u001f]/g, ' ');
  for (const [key,value] of Object.entries(process.env)) {
    if (/(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(key) && value && value.length >= 8) text = text.split(value).join('[redacted]');
  }
  return text.replace(/([?&](?:api_?key|key|token|secret|password|access_token|client_secret)=)[^&#\s]+/gi, '$1[redacted]');
}
