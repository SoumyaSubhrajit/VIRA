package com.vira.companion;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PaymentParser {
    static final class Payment { final double amount; final String direction, merchant; Payment(double a, String d, String m) { amount=a; direction=d; merchant=m; } }
    private static final Pattern AMOUNT = Pattern.compile("(?:₹|Rs\\.?|INR\\s*)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern MERCHANT = Pattern.compile("\\b(?:to|from|at|towards)\\s+([A-Za-z0-9][A-Za-z0-9 .&'()/_-]{1,100})", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEBIT = Pattern.compile("\\b(debited|debit|paid|sent|payment\\s+of|spent|transferred)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CREDIT = Pattern.compile("\\b(credited|credit|received|refund|cashback)\\b", Pattern.CASE_INSENSITIVE);
    static Payment parse(String title, String text) {
        String all=(title+" "+text).replace('\n',' ');
        String lower=all.toLowerCase(Locale.ROOT);
        if (lower.matches(".*\\b(otp|one[- ]time password|verification code|login code|passcode)\\b.*")) return null;
        Matcher a=AMOUNT.matcher(all); if(!a.find()) return null;
        String direction=DEBIT.matcher(all).find()?"debit":CREDIT.matcher(all).find()?"credit":""; if(direction.isEmpty()) return null;
        double amount; try { amount=Double.parseDouble(a.group(1).replace(",","")); } catch(Exception e) { return null; }
        Matcher m=MERCHANT.matcher(all); String merchant=m.find()?m.group(1).replaceAll("[.!?]+$","").trim():title.trim();
        if(merchant.isEmpty() || merchant.length()>160) return null;
        return new Payment(amount,direction,merchant);
    }
}
