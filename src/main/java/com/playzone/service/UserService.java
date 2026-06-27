package com.playzone.service;

import com.playzone.entity.User;
import com.playzone.entity.Transaction;
import com.playzone.repository.UserRepository;
import com.playzone.repository.TransactionRepository;
import com.playzone.util.HashUtil;
import com.playzone.util.JwtUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final JwtUtil jwtUtil;

    public UserService(UserRepository userRepository, TransactionRepository transactionRepository, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.transactionRepository = transactionRepository;
        this.jwtUtil = jwtUtil;
    }

    @Transactional
    public User registerUser(User user) {
        if (userRepository.findByUsername(user.getUsername()).isPresent()) {
            throw new IllegalArgumentException("Username is already taken");
        }
        if (userRepository.findByEmail(user.getEmail()).isPresent()) {
            throw new IllegalArgumentException("Email is already registered");
        }
        if (userRepository.findByPhoneNumber(user.getPhoneNumber()).isPresent()) {
            throw new IllegalArgumentException("Phone number is already registered");
        }

        // Hash the password
        user.setPassword(HashUtil.sha256(user.getPassword()));
        
        // Default values
        user.setWalletBalance(new BigDecimal("10.00")); // start demo balance
        user.setVipLevel(1);
        user.setAvatar("avatar1.png");

        User savedUser = userRepository.save(user);

        // Record a sign-up bonus transaction
        Transaction welcomeBonus = new Transaction(
                savedUser,
                "DEPOSIT",
                new BigDecimal("10.00"),
                "SUCCESS",
                "PlayZone Welcome Bonus Credits"
        );
        transactionRepository.save(welcomeBonus);

        return savedUser;
    }

    public String loginUser(String identifier, String password) {
        Optional<User> userOpt = userRepository.findByUsernameOrEmail(identifier, identifier);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("Invalid username, email, or password");
        }

        User user = userOpt.get();
        String hashedPassword = HashUtil.sha256(password);
        if (!user.getPassword().equals(hashedPassword)) {
            throw new IllegalArgumentException("Invalid username, email, or password");
        }

        // Generate JWT
        return jwtUtil.generateToken(user.getUsername());
    }

    public User getUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + username));
    }

    public User getUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    @Transactional
    public User depositFunds(User user, BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Deposit amount must be greater than zero");
        }

        // Fetch fresh copy to avoid concurrent write issues
        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        dbUser.setWalletBalance(dbUser.getWalletBalance().add(amount));
        User savedUser = userRepository.save(dbUser);

        // Log transaction
        Transaction tx = new Transaction(
                savedUser,
                "DEPOSIT",
                amount,
                "SUCCESS",
                "Added funds to wallet"
        );
        transactionRepository.save(tx);

        return savedUser;
    }

    @Transactional
    public User depositFundsWithUtr(User user, BigDecimal amount, String utr) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Deposit amount must be greater than zero");
        }
        if (utr == null || utr.trim().length() < 12) {
            throw new IllegalArgumentException("Invalid UPI transaction ID (UTR). Must be at least 12 characters");
        }

        // Fetch fresh copy to avoid concurrent write issues
        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Check if first-time PhonePe deposit
        boolean hasPreviousDeposit = hasPreviousPhonePeDeposit(dbUser);
        if (!hasPreviousDeposit && amount.compareTo(new BigDecimal("100.00")) < 0) {
            throw new IllegalArgumentException("First-time deposit must be at least ₹100.00");
        }

        dbUser.setWalletBalance(dbUser.getWalletBalance().add(amount));
        User savedUser = userRepository.save(dbUser);

        // Log transaction
        Transaction tx = new Transaction(
                savedUser,
                "DEPOSIT",
                amount,
                "SUCCESS",
                "PhonePe UPI Deposit (UTR: " + utr + ")"
        );
        transactionRepository.save(tx);

        return savedUser;
    }

    public boolean hasPreviousPhonePeDeposit(User user) {
        List<Transaction> txs = transactionRepository.findByUserOrderByCreatedAtDesc(user);
        for (Transaction tx : txs) {
            if ("DEPOSIT".equals(tx.getType()) && "SUCCESS".equals(tx.getStatus()) && tx.getDescription() != null && tx.getDescription().startsWith("PhonePe UPI Deposit")) {
                return true;
            }
        }
        return false;
    }

    @Transactional
    public User withdrawFunds(User user, BigDecimal amount) {
        if (amount.compareTo(new BigDecimal("109.00")) < 0) {
            throw new IllegalArgumentException("Minimum withdrawal amount is ₹109.00");
        }

        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (dbUser.getWalletBalance().compareTo(amount) < 0) {
            throw new IllegalArgumentException("Insufficient wallet balance");
        }

        dbUser.setWalletBalance(dbUser.getWalletBalance().subtract(amount));
        User savedUser = userRepository.save(dbUser);

        // Log transaction
        Transaction tx = new Transaction(
                savedUser,
                "WITHDRAW",
                amount,
                "SUCCESS",
                "Withdrawn funds from wallet"
        );
        transactionRepository.save(tx);

        return savedUser;
    }

    public List<Transaction> getUserTransactions(User user) {
        return transactionRepository.findByUserOrderByCreatedAtDesc(user);
    }
}
