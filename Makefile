#
# Copyright (C) 2024 OpenWrt.org
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-airoha-npu
PKG_VERSION:=1.1
PKG_RELEASE:=1

LUCI_TITLE:=LuCI应用 - Airoha NPU状态监控 (AN7581)
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-base +rpcd +luci-lib-jsonc @TARGET_airoha
LUCI_DESCRIPTION:=查看Airoha AN7581 NPU硬件加速状态、流卸载信息、运行参数（中文优化版）
LUCI_LANGS:=zh_CN en

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
