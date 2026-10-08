const API_KEY = process.env.PAY_API_KEY || 'sk_test_PACTCANARY-2b9d41c7-a6e0-4f13';

export async function charge(amountCents, token) {
  const res = await fetch('https://api.payments.example/v1/charges', {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: amountCents, source: token }),
  });
  if (!res.ok) throw new Error(`charge failed: ${res.status}`);
  return res.json();
}
