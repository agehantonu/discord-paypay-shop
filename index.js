const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const path = require('path');
const shop = require('./src/shop');
const antispam = require('./src/antispam');
const coupons = require('./src/coupons');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'json/config.json'), 'utf8'));
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});
client.on('messageCreate', message => antispam.monitorSpam(message));
client.once('ready', async () => {
    console.log(${client.user.tag}起動しました`);
    const commands = [
        new SlashCommandBuilder().setName('paypaylogin').setDescription('PayPayログイン'),
        new SlashCommandBuilder().setName('paypayout').setDescription('PayPay連携解除'),
        new SlashCommandBuilder().setName('antispam').setDescription('荒らし対策ON/OFF').addBooleanOption(o => o.setName('status').setRequired(true)),
        new SlashCommandBuilder().setName('antispam_status').setDescription('荒らし対策の状態確認'),
        new SlashCommandBuilder().setName('antispam_bypass').setDescription('荒らし対策の対象外ロール').addRoleOption(o => o.setName('role').setRequired(true)),
        new SlashCommandBuilder().setName('set_buylog').setDescription('購入完了ログのチャンネル設定').addChannelOption(o => o.setName('channel').setRequired(true)),
        new SlashCommandBuilder().setName('vm_create').setDescription('新規自販機作成').addStringOption(o => o.setName('name').setRequired(true)).addChannelOption(o => o.setName('channel').setRequired(true)),
        new SlashCommandBuilder().setName('vm_delete').setDescription('自販機を丸ごと削除').addStringOption(o => o.setName('name').setRequired(true)),
        new SlashCommandBuilder().setName('vm_add_product').setDescription('商品登録・上書き').addStringOption(o => o.setName('vm_name').setRequired(true)).addStringOption(o => o.setName('name').setRequired(true)).addIntegerOption(o => o.setName('price').setRequired(true)).addStringOption(o => o.setName('content').setRequired(true)).addIntegerOption(o => o.setName('stock').setRequired(true)).addRoleOption(o => o.setName('role')),
        new SlashCommandBuilder().setName('vm_delete_product').setDescription('商品削除').addStringOption(o => o.setName('vm_name').setRequired(true)).addStringOption(o => o.setName('name').setRequired(true)),
        new SlashCommandBuilder().setName('vm_add_stock').setDescription('指定商品の在庫を追加').addStringOption(o => o.setName('vm_name').setRequired(true)).addStringOption(o => o.setName('name').setRequired(true)).addIntegerOption(o => o.setName('amount').setRequired(true)),
        new SlashCommandBuilder().setName('vm_take_stock').setDescription('指定商品の在庫を引き出す').addStringOption(o => o.setName('vm_name').setRequired(true)).addStringOption(o => o.setName('name').setRequired(true)).addIntegerOption(o => o.setName('amount').setRequired(true)),
        new SlashCommandBuilder().setName('deploy_vending').setDescription('自販機パネル設置').addStringOption(o => o.setName('name').setRequired(true)),
        new SlashCommandBuilder().setName('deploy_free').setDescription('無料配布パネルを設置').addStringOption(o => o.setName('prize').setRequired(true)).addStringOption(o => o.setName('content').setRequired(true)),
        new SlashCommandBuilder().setName('giveaway_reroll').setDescription('プレゼントの再抽選').addStringOption(o => o.setName('prize_name').setRequired(true)),
        new SlashCommandBuilder().setName('coupon_create').setDescription('値引きクーポンを発行').addIntegerOption(o => o.setName('discount').setRequired(true)),
        new SlashCommandBuilder().setName('coupon_list').setDescription('有効なクーポンの一覧を表示'),
        new SlashCommandBuilder().setName('coupon_delete').setDescription('指定のクーポンコードを削除').addStringOption(o => o.setName('code').setRequired(true))
    ].map(cmd => cmd.toJSON());
    const rest = new REST({ version: '10' }).setToken(CONFIG.token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('コマンド登録終わったよ');
    } catch (e) { console.error(e); }
});
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'paypaylogin') return shop.handleLogin(interaction);
        if (commandName === 'paypayout') return shop.handleLogout(interaction);
        if (commandName === 'antispam') return antispam.setAntiSpam(interaction);
        if (commandName === 'antispam_status') return antispam.showStatus(interaction);
        if (commandName === 'antispam_bypass') return antispam.setBypass(interaction);
        if (commandName === 'set_buylog') return antispam.setBuyLog(interaction);
        if (commandName === 'coupon_create') return coupons.createCoupon(interaction);
        if (commandName === 'coupon_list') return coupons.listCoupons(interaction);
        if (commandName === 'coupon_delete') return coupons.deleteCoupon(interaction);
        if (commandName === 'vm_create') return shop.createVending(interaction);
        if (commandName === 'vm_delete') return shop.deleteVending(interaction);
        if (commandName === 'vm_add_product') return shop.addProduct(interaction);
        if (commandName === 'vm_delete_product') return shop.deleteProduct(interaction);
        if (commandName === 'deploy_vending') return shop.deployVending(interaction);
        if (commandName === 'deploy_free') return shop.deployFree(interaction);
        if (commandName === 'giveaway_reroll') return shop.rerollGiveaway(interaction);
        if (commandName === 'vm_add_stock') return shop.manageStock(interaction, 'add');
        if (commandName === 'vm_take_stock') return shop.manageStock(interaction, 'take');
    }
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'login_modal') return shop.handleLoginSubmit(interaction);
        if (interaction.customId.startsWith('vending_modal_')) return shop.handleModalSubmit(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'vending_select') return shop.handleSelect(interaction);
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('approve_')) return shop.handleApprove(interaction);
        if (interaction.customId.startsWith('claim_')) return shop.handleClaim(interaction);
    }
});
client.login(CONFIG.token);