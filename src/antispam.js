const fs = require('fs');
const path = require('path');
const { createEmbed } = require('./shop');
const CONFIG_PATH = path.join(__dirname, '../json/config.json');
const messageLog = new Map();
function getConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), 'utf8');
}
module.exports = {
    monitorSpam(message) {
        const config = getConfig();
        if (message.author.bot || !message.guild || !config.antiSpamEnabled) return;
        if (config.bypassRoleId && message.member.roles.cache.has(config.bypassRoleId)) return;
        const userId = message.author.id;
        const now = Date.now();
        if (!messageLog.has(userId)) messageLog.set(userId, []);
        const timestamps = messageLog.get(userId);
        timestamps.push(now);
        while (timestamps.length > 0 && timestamps[0] < now - 10000) { timestamps.shift(); }
        if (timestamps.length >= 7) {
            messageLog.delete(userId);
            message.member.timeout(86400000, 'スパム行為による自動処置')
                .then(() => message.channel.send({ embeds: [createEmbed('荒らし対策', `ユーザー ${message.author.toString()} を24時間タイムアウトしました。`)] }))
                .catch(err => console.error('タイムアウト失敗:', err));
        }
    },
    async setAntiSpam(interaction) {
        const config = getConfig();
        config.antiSpamEnabled = interaction.options.getBoolean('status');
        saveConfig(config);
        await interaction.reply({ embeds: [createEmbed('🛡️ 荒らし対策設定', `アンチスパムを **${config.antiSpamEnabled ? '有効' : '無効'}** にしました。`)], ephemeral: true });
    },
    async showStatus(interaction) {
        const config = getConfig();
        const embed = createEmbed('🛡️ 荒らし対策ステータス確認')
            .addFields(
                { name: '作動状態', value: config.antiSpamEnabled ? '🟩 有効' : '🟥 無効' },
                { name: '除外ロール', value: config.bypassRoleId ? `<@&${config.bypassRoleId}>` : 'なし' }
            );
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
    async setBypass(interaction) {
        const config = getConfig();
        const role = interaction.options.getRole('role');
        config.bypassRoleId = role.id;
        saveConfig(config);
        await interaction.reply({ embeds: [createEmbed('🛡️ 除外設定', `${role.toString()} を対象外に指定しました。`)], ephemeral: true });
    },
    async setBuyLog(interaction) {
        const config = getConfig();
        const ch = interaction.options.getChannel('channe');
        config.buyLogChannel = ch.id;
        saveConfig(config);
        await interaction.reply({ embeds: [createEmbed('📝 ログ設定', `購入ログの送信先を ${ch.toString()} に指定しました。`)], ephemeral: true });
    }
};