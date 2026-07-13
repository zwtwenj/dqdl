-- 管理员账号表（管理平台后端 dqdl_admin 自己的表，与游戏 user 表完全隔离）。
-- 幂等：可重复执行。dqdl_admin 后端已关闭 synchronize，用此脚本手动建表。
-- 默认管理员 admin/123456 由后端 onApplicationBootstrap 幂等创建（密码 bcrypt 哈希）。
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(32) NOT NULL COMMENT '登录账号',
  `password` VARCHAR(100) NOT NULL COMMENT 'bcrypt 哈希',
  `nickname` VARCHAR(32) DEFAULT NULL COMMENT '昵称',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_admin_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员账号表（管理平台专用）';
