PO_FILES = airoha_npu.po
LMO_FILES = $(PO_FILES:.po=.lmo)

PKG_CONFIG_DEPENDS += CONFIG_LUCI_LANG_zh_CN

all: $(LMO_FILES)

%.lmo: %.po
	@echo "Compile $< to $@"
	po2lmo $< $@ || rm -f $@

clean:
	rm -f $(LMO_FILES)

install: $(LMO_FILES)
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) $(LMO_FILES) $(1)/usr/lib/lua/luci/i18n/

.PHONY: all clean install