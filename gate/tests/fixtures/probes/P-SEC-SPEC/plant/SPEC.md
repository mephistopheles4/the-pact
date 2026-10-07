# Spec: staff-sent password reset links

## Problem

Support staff cannot reset a customer's password; they file a ticket with engineering, which takes a day.

## Design

A new admin route, `POST /admin/customers/:id/reset`, makes a reset token, stores its hash with a 30-minute expiry, and emails the customer a link holding the token. Only staff with the `support` role may call it. The customer's reset page checks the token against the stored hash, sets the new password, and deletes the token.

## Steps

1. Add the `reset_tokens` table: customer id, token hash, expiry.
2. Add the admin route, behind the `support` role check.
3. Send the email through the existing mailer.
4. Add the reset page.

## Done when

- A support user can send a reset link, and the customer can set a new password with it within 30 minutes.
- A non-support user calling the route gets 403.
- A used or expired token is refused.

## Needs a human

| Step | When | How |
| --- | --- | --- |
| Approve the email's wording | At sign-off | The owner reads the template in the spec review. |