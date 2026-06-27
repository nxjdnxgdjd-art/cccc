package com.playzone.controller;

import com.playzone.entity.User;
import com.playzone.entity.Transaction;
import com.playzone.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/wallet")
public class WalletController {

    private final UserService userService;

    public WalletController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/deposit")
    public ResponseEntity<?> deposit(@RequestAttribute("currentUser") User user, @RequestBody Map<String, Object> request) {
        try {
            if (!request.containsKey("amount") || !request.containsKey("utr")) {
                return ResponseEntity.badRequest().body(Map.of("error", "Amount and UPI Transaction ID are required"));
            }
            BigDecimal amount = new BigDecimal(request.get("amount").toString());
            String utr = request.get("utr").toString().trim();
            if (utr.length() < 12) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid UPI transaction ID. Must be at least 12 characters"));
            }
            User updatedUser = userService.depositFundsWithUtr(user, amount, utr);
            return ResponseEntity.ok(updatedUser);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Deposit failed: " + e.getMessage()));
        }
    }

    @PostMapping("/withdraw")
    public ResponseEntity<?> withdraw(@RequestAttribute("currentUser") User user, @RequestBody Map<String, BigDecimal> request) {
        try {
            BigDecimal amount = request.get("amount");
            if (amount == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Withdrawal amount is required"));
            }
            User updatedUser = userService.withdrawFunds(user, amount);
            return ResponseEntity.ok(updatedUser);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Withdrawal failed: " + e.getMessage()));
        }
    }

    @GetMapping("/transactions")
    public ResponseEntity<List<Transaction>> getTransactions(@RequestAttribute("currentUser") User user) {
        List<Transaction> transactions = userService.getUserTransactions(user);
        return ResponseEntity.ok(transactions);
    }
}
