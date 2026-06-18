const { DB, saveDB, createEmbed } = require('./shop');

module.exports = {
    async createCoupon(interaction) {
        const discount = interaction.options.getInteger('discount');
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 50; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

        DB.coupons[code] = discount;
        saveDB();

        const embed = createEmbed('🎫 クーポン新規発行', `**値引き額:** ${discount} 円`)
            .addFields({ name: 'クーポン', value: `\`${code}\`` });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async listCoupons(interaction) {
        const codes = Object.keys(DB.coupons);
        if (codes.length === 0) return interaction.reply({ embeds: [createEmbed('🎫 クーポン一覧', '有効なクーポンはありません。')], ephemeral: true });
        
        let desc = '';
        codes.forEach(c => { desc += `・\`${c.substring(0, 10)}...\` : **${DB.coupons[c]}円引き**\n`; });
        await interaction.reply({ embeds: [createEmbed('🎫 有効なクーポン一覧', desc)], ephemeral: true });
    },

    async deleteCoupon(interaction) {
        const code = interaction.options.getString('code');
        if (!DB.coupons[code]) return interaction.reply({ embeds: [createEmbed('❌ エラー', 'コードが存在しません。')], ephemeral: true });
        delete DB.coupons[code];
        saveDB();
        await interaction.reply({ embeds: [createEmbed('🗑️ クーポン削除完了', 'コードを無効化しました。')], ephemeral: true });
    }
};