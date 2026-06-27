package com.playzone.controller;

import com.playzone.entity.User;
import com.playzone.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        try {
            if (!request.getPassword().equals(request.getConfirmPassword())) {
                return ResponseEntity.badRequest().body(Map.of("error", "Passwords do not match"));
            }

            User user = new User();
            user.setFirstName(request.getFirstName());
            user.setLastName(request.getLastName());
            user.setEmail(request.getEmail());
            user.setPhoneNumber(request.getPhoneNumber());
            user.setUsername(request.getUsername());
            user.setPassword(request.getPassword());
            user.setReferralCode(request.getReferralCode());

            User registered = userService.registerUser(user);
            return ResponseEntity.ok(registered);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Registration failed: " + e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        try {
            String token = userService.loginUser(request.getIdentifier(), request.getPassword());
            User user = userService.getUserByUsername(jwtUsername(token));

            Map<String, Object> response = new HashMap<>();
            response.put("token", token);
            response.put("user", user);

            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Login failed: " + e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMe(HttpServletRequest request) {
        User currentUser = (User) request.getAttribute("currentUser");
        if (currentUser == null) {
            // Check if JWT validation did not attach currentUser
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        
        // Fetch fresh copy with updated wallet balance
        User freshUser = userService.getUserById(currentUser.getId());
        return ResponseEntity.ok(freshUser);
    }

    // Helper to get username from JWT (parsed briefly by controller or util)
    private String jwtUsername(String token) {
        // We know login returns a valid token; this helper is just for user lookup on success
        return userService.getUserByUsername(new com.playzone.util.JwtUtil("404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970", 86400000).getUsernameFromToken(token)).getUsername();
    }

    // Request DTO classes
    public static class RegisterRequest {
        private String firstName;
        private String lastName;
        private String email;
        private String phoneNumber;
        private String username;
        private String password;
        private String confirmPassword;
        private String referralCode;

        public String getFirstName() { return firstName; }
        public void setFirstName(String firstName) { this.firstName = firstName; }

        public String getLastName() { return lastName; }
        public void setLastName(String lastName) { this.lastName = lastName; }

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }

        public String getPhoneNumber() { return phoneNumber; }
        public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }

        public String getConfirmPassword() { return confirmPassword; }
        public void setConfirmPassword(String confirmPassword) { this.confirmPassword = confirmPassword; }

        public String getReferralCode() { return referralCode; }
        public void setReferralCode(String referralCode) { this.referralCode = referralCode; }
    }

    public static class LoginRequest {
        private String identifier; // email or username
        private String password;

        public String getIdentifier() { return identifier; }
        public void setIdentifier(String identifier) { this.identifier = identifier; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
    }
}
