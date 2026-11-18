---
id: tax
keywords: tax rate taxable POS settings receipt header footer address owner configure rounding
---

# Configuring tax and receipt information

## Before you start

Only the owner can change POS settings. Your business determines the appropriate tax treatment; the AI cannot decide its tax policy. CERMS needs a configured rate before completing taxable sales.

## Steps

1. Open Point of sale and its Settings tab.
2. Review the selected business, tax rate and receipt header/address/footer fields.
3. Enter the authorized tax rate, including an explicit zero where appropriate, and the intended receipt information.
4. Save and wait for confirmation. Refresh POS if a cashier still has old settings.
5. In Products, an authorized catalog manager marks each item taxable or not. Check a representative order's subtotal, discount, tax and total before recording its actual payment.

## How amounts work

Tax applies to taxable line amounts after eligible discounts. Rounding is performed on saved line amounts. A waived line is zero. Refunds use the original receipt's paid amounts/tax rather than today's rate or catalog price.

## If checkout is blocked

Check tax configuration and taxable flags; do not simply mark a taxable product non-taxable to bypass setup. A setting changed during payment can require refreshing/reviewing the unsaved order. Existing sale receipts retain their saved snapshots; a closeout print uses the current business receipt header. A tax setting does not activate card processing or accounting integration.
