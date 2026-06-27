package com.playzone.repository;

import com.playzone.entity.MinesSession;
import com.playzone.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MinesSessionRepository extends JpaRepository<MinesSession, Long> {
    List<MinesSession> findByUserAndStatus(User user, String status);
}
