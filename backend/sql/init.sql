-- ============================================================
-- 后台管理 + 数据看板 数据库 Schema
-- 使用方式：
--   方式一（推荐）：npm run init-db   （自动建库 + 建表 + 填充演示数据）
--   方式二：手动执行本文件（需先创建数据库 admin_dashboard）
-- ============================================================

CREATE DATABASE IF NOT EXISTS `admin_dashboard`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `admin_dashboard`;

-- ------------------------------------------------------------
-- 1. 角色表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  `name`        VARCHAR(50)  NOT NULL COMMENT '角色名称',
  `code`        VARCHAR(50)  NOT NULL COMMENT '角色编码，如 admin / operator',
  `description` VARCHAR(200) DEFAULT NULL COMMENT '角色描述',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB COMMENT='角色表';

-- ------------------------------------------------------------
-- 2. 用户表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username`   VARCHAR(50)  NOT NULL COMMENT '登录名',
  `password`   VARCHAR(100) NOT NULL COMMENT '密码（bcrypt 加密）',
  `nickname`   VARCHAR(50)  DEFAULT NULL COMMENT '昵称',
  `email`      VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  `avatar`     VARCHAR(255) DEFAULT NULL COMMENT '头像地址',
  `role_id`    INT UNSIGNED NOT NULL COMMENT '角色ID',
  `status`     TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0禁用',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_role` (`role_id`),
  CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB COMMENT='用户表';

-- ------------------------------------------------------------
-- 3. 菜单 / 权限表（RBAC）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `menus`;
CREATE TABLE `menus` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
  `parent_id`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父菜单ID，0 为顶级',
  `name`       VARCHAR(50)  NOT NULL COMMENT '菜单名称',
  `path`       VARCHAR(100) DEFAULT NULL COMMENT '前端路由路径',
  `icon`       VARCHAR(50)  DEFAULT NULL COMMENT '图标',
  `type`       TINYINT      NOT NULL DEFAULT 1 COMMENT '类型：1菜单 2按钮',
  `permission` VARCHAR(100) DEFAULT NULL COMMENT '权限标识，如 user:create',
  `sort`       INT          NOT NULL DEFAULT 0 COMMENT '排序',
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB COMMENT='菜单/权限表';

-- ------------------------------------------------------------
-- 4. 角色-菜单关联表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `role_menu`;
CREATE TABLE `role_menu` (
  `role_id` INT UNSIGNED NOT NULL,
  `menu_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `menu_id`),
  CONSTRAINT `fk_rm_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_menu` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='角色-菜单关联表';

-- ------------------------------------------------------------
-- 5. 销售分类表（数据看板用）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id`   INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类ID',
  `name` VARCHAR(50)  NOT NULL COMMENT '分类名称',
  `sort` INT          NOT NULL DEFAULT 0 COMMENT '排序',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='销售分类表';

-- ------------------------------------------------------------
-- 6. 销售记录表（数据看板趋势 / 占比 / 排行数据源）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sales`;
CREATE TABLE `sales` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '记录ID',
  `category_id` INT UNSIGNED NOT NULL COMMENT '分类ID',
  `amount`      DECIMAL(12,2) NOT NULL COMMENT '销售金额',
  `qty`         INT          NOT NULL DEFAULT 0 COMMENT '销量',
  `sale_date`   DATE         NOT NULL COMMENT '销售日期',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_date` (`sale_date`),
  KEY `idx_category` (`category_id`),
  CONSTRAINT `fk_sale_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB COMMENT='销售记录表';

-- ------------------------------------------------------------
-- 7. 商品表（商品管理用）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `goods`;
CREATE TABLE `goods` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '商品ID',
  `name`        VARCHAR(100) NOT NULL COMMENT '商品名称',
  `sku`         VARCHAR(50)  NOT NULL COMMENT 'SKU 编码',
  `category`    VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '分类名称（对应看板分类）',
  `price`       DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '售价',
  `stock`       INT          NOT NULL DEFAULT 0 COMMENT '库存',
  `sales`       INT          NOT NULL DEFAULT 0 COMMENT '累计销量',
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1上架 0下架',
  `image`       VARCHAR(255) DEFAULT NULL COMMENT '缩略图地址，空则前端占位',
  `description` TEXT COMMENT '商品描述',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sku` (`sku`),
  KEY `idx_category` (`category`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB COMMENT='商品表';

-- ------------------------------------------------------------
-- 8. 系统设置表（键值对，便于扩展）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `key`        VARCHAR(50) NOT NULL COMMENT '设置项名，如 systemName / themeColor',
  `value`      TEXT COMMENT '设置值（统一按字符串存，数字型读时转换）',
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB COMMENT='系统设置表';
