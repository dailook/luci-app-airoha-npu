'use strict';
'require view';
'require poll';
'require rpc';
'require fs';

var callNpuStatus = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'getStatus'
});

var callPpeEntries = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'getPpeEntries'
});

// 格式化字节（优化单位显示）
function formatBytes(bytes) {
	if (bytes === 0 || !bytes) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// 格式化包数（优化大数显示）
function formatPackets(packets) {
	if (packets === 0 || !packets) return '0';
	if (packets >= 1e9) return `${(packets / 1e9).toFixed(2)}G`;
	if (packets >= 1e6) return `${(packets / 1e6).toFixed(2)}M`;
	if (packets >= 1e3) return `${(packets / 1e3).toFixed(2)}K`;
	return packets.toString();
}

// 计算NPU总内存（兼容更多单位格式）
function calcTotalMemory(memRegions) {
	if (!Array.isArray(memRegions) || memRegions.length === 0) return '0 KiB';
	
	let totalKB = 0;
	memRegions.forEach(function(region) {
		const sizeStr = region.size || '';
		const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(KiB|MiB|GiB|KB|MB|GB|B)/i);
		if (match) {
			const size = parseFloat(match[1]);
			const unit = match[2].toUpperCase();
			switch(unit) {
				case 'B': totalKB += size / 1024; break;
				case 'KB': case 'KIB': totalKB += size; break;
				case 'MB': case 'MIB': totalKB += size * 1024; break;
				case 'GB': case 'GIB': totalKB += size * 1024 * 1024; break;
			}
		}
	});

	return totalKB >= 1024 
		? `${(totalKB / 1024).toFixed(1)} MiB` 
		: `${totalKB.toFixed(0)} KiB`;
}

// 渲染PPE条目（增加空数据提示）
function renderPpeRows(entries) {
	if (!Array.isArray(entries) || entries.length === 0) {
		return [E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'colspan': 8, 'style': 'text-align:center;' }, _('No PPE flow entries available'))
		])];
	}

	// 限制最多显示200条（避免界面卡顿）
	return entries.slice(0, 200).map(function(entry) {
		const stateClass = entry.state === 'BND' ? 'label-success' : entry.state === 'UNB' ? 'label-warning' : 'label-default';
		const ethDisplay = (entry.eth === '00:00:00:00:00:00->00:00:00:00:00:00' || !entry.eth) ? '-' : entry.eth;

		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, entry.index || '-'),
			E('td', { 'class': 'td' }, E('span', { 'class': `label ${stateClass}` }, entry.state || '-')),
			E('td', { 'class': 'td' }, entry.type || '-'),
			E('td', { 'class': 'td' }, entry.orig || '-'),
			E('td', { 'class': 'td' }, entry.new_flow || '-'),
			E('td', { 'class': 'td' }, ethDisplay),
			E('td', { 'class': 'td' }, formatPackets(entry.packets)),
			E('td', { 'class': 'td' }, formatBytes(entry.bytes))
		]);
	});
}

// 手动刷新按钮组件
function renderRefreshButton(refreshCallback) {
	return E('div', { 'style': 'margin-bottom:10px;' }, [
		E('button', {
			'class': 'btn btn-primary',
			'click': function() {
				this.disabled = true;
				this.textContent = _('Refreshing...');
				refreshCallback().then(() => {
					this.disabled = false;
					this.textContent = _('Manual Refresh');
				});
			}
		}, _('Manual Refresh'))
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			callNpuStatus().catch(err => {
				console.error('Failed to get NPU status:', err);
				return {};
			}),
			callPpeEntries().catch(err => {
				console.error('Failed to get PPE entries:', err);
				return { entries: [] };
			})
		]);
	},

	render: function(data) {
		const status = data[0] || {};
		const ppeData = data[1] || {};
		const entries = Array.isArray(ppeData.entries) ? ppeData.entries : [];
		const memRegions = Array.isArray(status.memory_regions) ? status.memory_regions : [];
		const totalMemoryStr = calcTotalMemory(memRegions);

		// 定义手动刷新函数
		const manualRefresh = () => {
			return this.load().then(newData => {
				this.renderContent(newData);
				return newData;
			});
		};

		// 渲染主界面
		const viewEl = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Airoha NPU 状态监控')), // 汉化标题
			
			// 手动刷新按钮
			renderRefreshButton(manualRefresh),

			// NPU 基础信息区
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('NPU 基础信息')),
				E('table', { 'class': 'table table-striped' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td', 'width': '33%' }, E('strong', {}, _('NPU 固件版本'))),
						E('td', { 'class': 'td', 'id': 'npu-version' }, status.npu_version || _('未获取到'))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('NPU 运行状态'))),
						E('td', { 'class': 'td', 'id': 'npu-status' }, status.npu_loaded ?
							E('span', { 'class': 'label label-success' }, `${_('已激活')}${status.npu_device ? ' (' + status.npu_device + ')' : ''}`) :
							E('span', { 'class': 'label label-danger' }, _('未激活')))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('NPU 时钟/核心数'))),
						E('td', { 'class': 'td', 'id': 'npu-clock' }, 
							(status.npu_clock ? `${(status.npu_clock / 1000000).toFixed(0)} MHz` : '未知') + 
							' / ' + (status.npu_cores || 0) + ' 核心')
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('预留内存总量'))),
						E('td', { 'class': 'td', 'id': 'npu-memory' }, `${totalMemoryStr} (共 ${memRegions.length} 个内存区域)`)
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('卸载流量统计'))),
						E('td', { 'class': 'td', 'id': 'npu-offload' }, 
							`${formatPackets(status.offload_packets)} 数据包 / ${formatBytes(status.offload_bytes)}`)
					])
				])
			]),

			// PPE 流卸载条目区
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('PPE 流卸载条目')),
				E('div', { 'class': 'cbi-section-descr', 'id': 'ppe-summary' },
					`${_('总计:')} ${entries.length} | ${_('已绑定:')} ${entries.filter(e => e.state === 'BND').length} | ${_('未绑定:')} ${entries.filter(e => e.state === 'UNB').length}`
				),
				E('div', { 'style': 'overflow-x:auto;' }, [ // 适配小屏幕横向滚动
					E('table', { 'class': 'table table-striped', 'id': 'ppe-entries-table' }, [
						E('tr', { 'class': 'tr cbi-section-table-titles' }, [
							E('th', { 'class': 'th' }, _('索引')),
							E('th', { 'class': 'th' }, _('状态')),
							E('th', { 'class': 'th' }, _('类型')),
							E('th', { 'class': 'th' }, _('原始流')),
							E('th', { 'class': 'th' }, _('新流')),
							E('th', { 'class': 'th' }, _('以太网地址')),
							E('th', { 'class': 'th' }, _('数据包数')),
							E('th', { 'class': 'th' }, _('字节数'))
						])
					].concat(renderPpeRows(entries)))
				])
			])
		]);

		// 挂载渲染内容的方法（用于手动刷新）
		this.renderContent = (newData) => {
			const newStatus = newData[0] || {};
			const newPpeData = newData[1] || {};
			const newEntries = Array.isArray(newPpeData.entries) ? newPpeData.entries : [];
			const newMemRegions = Array.isArray(newStatus.memory_regions) ? newStatus.memory_regions : [];

			// 更新NPU版本
			const versionEl = document.getElementById('npu-version');
			if (versionEl) versionEl.textContent = newStatus.npu_version || _('未获取到');

			// 更新NPU状态
			const statusEl = document.getElementById('npu-status');
			if (statusEl) {
				statusEl.innerHTML = '';
				if (newStatus.npu_loaded) {
					const span = document.createElement('span');
					span.className = 'label label-success';
					span.textContent = `${_('已激活')}${newStatus.npu_device ? ' (' + newStatus.npu_device + ')' : ''}`;
					statusEl.appendChild(span);
				} else {
					const span = document.createElement('span');
					span.className = 'label label-danger';
					span.textContent = _('未激活');
					statusEl.appendChild(span);
				}
			}

			// 更新时钟/核心数
			const clockEl = document.getElementById('npu-clock');
			if (clockEl) {
				clockEl.textContent = (newStatus.npu_clock ? `${(newStatus.npu_clock / 1000000).toFixed(0)} MHz` : '未知') + 
					' / ' + (newStatus.npu_cores || 0) + ' 核心';
			}

			// 更新内存总量
			const memoryEl = document.getElementById('npu-memory');
			if (memoryEl) {
				memoryEl.textContent = `${calcTotalMemory(newMemRegions)} (共 ${newMemRegions.length} 个内存区域)`;
			}

			// 更新卸载统计
			const offloadEl = document.getElementById('npu-offload');
			if (offloadEl) {
				offloadEl.textContent = `${formatPackets(newStatus.offload_packets)} 数据包 / ${formatBytes(newStatus.offload_bytes)}`;
			}

			// 更新PPE汇总
			const summaryEl = document.getElementById('ppe-summary');
			if (summaryEl) {
				summaryEl.textContent = `${_('总计:')} ${newEntries.length} | ${_('已绑定:')} ${newEntries.filter(e => e.state === 'BND').length} | ${_('未绑定:')} ${newEntries.filter(e => e.state === 'UNB').length}`;
			}

			// 更新PPE表格
			const table = document.getElementById('ppe-entries-table');
			if (table) {
				while (table.rows.length > 1) table.deleteRow(1);
				const newRows = renderPpeRows(newEntries);
				newRows.forEach(row => table.appendChild(row));
			}
		};

		// 设置自动轮询（改为10秒，减少资源占用）
		poll.add(L.bind(function() {
			return this.load().then(L.bind(this.renderContent, this));
		}, this), 10);

		return viewEl;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});