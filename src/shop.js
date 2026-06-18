const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const THEME_COLOR = 0x242929;
const DATA_PATH = path.join(__dirname, '../json/data.json');
const CONFIG_PATH = path.join(__dirname, '../json/config.json');
let DB = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
function saveDB() {
    fs.writeFileSync(DATA_PATH, JSON.stringify(DB, null, 4), 'utf8');
}
function getConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
function createEmbed(title, description) {
    return new EmbedBuilder().setTitle(title).setDescription(description).setColor(THEME_COLOR);
}
function isNotLoggedIn(interaction) {
    if (!DB.userSession[interaction.user.id]) {
        interaction.reply({
            embeds: [createEmbed('🔒 アクセス制限', '利用するには、事前に `/paypaylogin` でアカウント連携を完了させてください。')],
            ephemeral: true
        });
        return true;
    }
    return false;
}
module.exports = {
    DB,
    saveDB,
    createEmbed,
    async handleLogin(interaction) {
        const modal = new ModalBuilder().setCustomId('login_modal').setTitle('PayPay アカウント連携');
        const idInput = new TextInputBuilder().setCustomId('paypay_id').setLabel('PayPay ID または 携帯電話番号').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        await interaction.showModal(modal);
    },
    async handleLogout(interaction) {
        if (!DB.userSession[interaction.user.id]) return interaction.reply({ embeds: [createEmbed('❌ エラー', 'ログインしていません。')], ephemeral: true });
        delete DB.userSession[interaction.user.id];
        saveDB();
        await interaction.reply({ embeds: [createEmbed('🔓 ログアウト完了', '連携を安全に解除しました。')], ephemeral: true });
    },
    async handleLoginSubmit(interaction) {
        const paypayId = interaction.fields.getTextInputValue('paypay_id');
        DB.userSession[interaction.user.id] = { paypayId };
        saveDB();
        await interaction.reply({ embeds: [createEmbed('🟩 ログイン成功', `PayPay連携が完了しました。(ID: \`${paypayId}\`)`)], ephemeral: true });
    },
    async createVending(interaction) {
        const name = interaction.options.getString('name');
        const channel = interaction.options.getChannel('channel');
        DB.vending[name] = { paypayChannel: channel.id, products: {} };
        saveDB();
        await interaction.reply({ embeds: [createEmbed('🛒 自販機作成', `自販機 \`${name}\` を作成しました。通知先: <#${channel.id}>`)], ephemeral: true });
    },
    async deleteVending(interaction) {
        const name = interaction.options.getString('name');
        if (!DB.vending[name]) return interaction.reply({ embeds: [createEmbed('❌ エラー', '該当する自販機がありません。')], ephemeral: true });
        delete DB.vending[name];
        saveDB();
        await interaction.reply({ embeds: [createEmbed('🗑️ 自販機削除', `自販機 \`${name}\` を丸ごとデータベースから削除しました。`)], ephemeral: true });
    },
    async addProduct(interaction) {
        const vmName = interaction.options.getString('vm_name');
        const name = interaction.options.getString('name');
        const price = interaction.options.getInteger('price');
        const content = interaction.options.getString('content');
        const stock = interaction.options.getInteger('stock');
        const role = interaction.options.getRole('role');
        if (!DB.vending[vmName]) return interaction.reply({ embeds: [createEmbed('❌ エラー', `自販機 \`${vmName}\` が見つかりません。`)], ephemeral: true });
        DB.vending[vmName].products[name] = { price, content, stock, roleId: role ? role.id : null };
        saveDB();
        await interaction.reply({ embeds: [createEmbed('📦 商品登録', `\`${vmName}\` に **${name}** を追加しました。`)], ephemeral: true });
    },
    async deleteProduct(interaction) {
        const vmName = interaction.options.getString('vm_name');
        const name = interaction.options.getString('name');
        if (!DB.vending[vmName] || !DB.vending[vmName].products[name]) return interaction.reply({ embeds: [createEmbed('❌ エラー', '自販機または商品がありません。')], ephemeral: true });
        delete DB.vending[vmName].products[name];
        saveDB();
        await interaction.reply({ embeds: [createEmbed('🗑️ 商品削除', `\`${vmName}\` から **${name}** を削除しました。`)], ephemeral: true });
    },
    async manageStock(interaction, type) {
        const vmName = interaction.options.getString('vm_name');
        const name = interaction.options.getString('name');
        const amount = interaction.options.getInteger('amount');
        if (!DB.vending[vmName] || !DB.vending[vmName].products[name]) return interaction.reply({ embeds: [createEmbed('❌ エラー', '商品が見つかりません。')], ephemeral: true });
        if (DB.vending[vmName].products[name].stock === -1) return interaction.reply({ embeds: [createEmbed('⚠️ エラー', 'この商品は無限在庫です。')], ephemeral: true });
        if (type === 'add') {
            DB.vending[vmName].products[name].stock += amount;
            await interaction.reply({ embeds: [createEmbed('🟩 在庫追加成功', `商品「${name}」の在庫を **${amount}個** 補充しました。`)], ephemeral: true });
        } else {
            DB.vending[vmName].products[name].stock = Math.max(0, DB.vending[vmName].products[name].stock - amount);
            await interaction.reply({ embeds: [createEmbed('🗑️ 在庫引き出し成功', `商品「${name}」の在庫を **${amount}個** 引き出しました。`)], ephemeral: true });
        }
        saveDB();
    },
    async deployVending(interaction) {
        const name = interaction.options.getString('name');
        const vm = DB.vending[name];
        if (!vm) return interaction.reply({ embeds: [createEmbed('❌ エラー', '自販機が見つかりません。')], ephemeral: true });
        const options = Object.keys(vm.products).map(pName => {
            const p = vm.products[pName];
            return { label: `${pName} (${p.price}円) [在庫:${p.stock === -1 ? '∞' : p.stock}]`, value: `${name}:${pName}` };
        });
        if (options.length === 0) options.push({ label: '売切中', value: 'none' });
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('vending_select').setPlaceholder('商品を選択してください').addOptions(options.slice(0, 25))
        );
        await interaction.channel.send({ embeds: [createEmbed(`🛒 ${name} 自動販売機`, '商品を選び、決済手続きに進んでください。\n⚠️事前に `/paypaylogin` が必須です。')], components: [row] });
        await interaction.reply({ embeds: [createEmbed('⚙️ システム', 'パネルを配置しました。')], ephemeral: true });
    },
    async handleSelect(interaction) {
        if (interaction.values[0] === 'none') return interaction.deferUpdate();
        if (isNotLoggedIn(interaction)) return;
        const [vmName, pName] = interaction.values[0].split(':');
        const modal = new ModalBuilder().setCustomId(`vending_modal_${vmName}_${pName}`).setTitle('購入・決済手続き');
        const linkInput = new TextInputBuilder().setCustomId('paypay_url').setLabel('PayPayの送金リンク').setStyle(TextInputStyle.Short).setRequired(true);
        const couponInput = new TextInputBuilder().setCustomId('coupon_code').setLabel('クーポンコード(任意)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50);
        modal.addComponents(new ActionRowBuilder().addComponents(linkInput), new ActionRowBuilder().addComponents(couponInput));
        await interaction.showModal(modal);
    },
    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const [,, vmName, pName] = interaction.customId.split('_');
        const paypayUrl = interaction.fields.getTextInputValue('paypay_url');
        const inputCoupon = interaction.fields.getTextInputValue('coupon_code').trim();
        const vm = DB.vending[vmName];
        const product = vm ? vm.products[pName] : null;
        if (!product) return interaction.followUp({ embeds: [createEmbed('❌ エラー', '商品がありません。')] });
        let finalPrice = product.price;
        let couponUsedText = '未使用';
        if (inputCoupon) {
            if (DB.coupons[inputCoupon]) {
                finalPrice = Math.max(0, finalPrice - DB.coupons[inputCoupon]);
                couponUsedText = `適用成功 ( ${DB.coupons[inputCoupon]} 円引き )`;
            } else {
                return interaction.followUp({ embeds: [createEmbed('❌ クーポンエラー', '無効なクーポンコードです。')] });
            }
        }
        const notifyChannel = interaction.client.channels.cache.get(vm.paypayChannel);
        if (!notifyChannel) return interaction.followUp({ content: '❌ 通知先チャンネルエラー' });
        const session = DB.userSession[interaction.user.id];
        const adminEmbed = createEmbed('🔔 【要確認】PayPay決済要求', `購入者: ${interaction.user.toString()}`)
            .addFields(
                { name: 'PayPayログインID', value: `\`${session ? session.paypayId : '不明'}\`` },
                { name: '商品名', value: `**${pName}**` },
                { name: '最終請求額', value: `${product.price}円 ➔ **${finalPrice} 円** (\`${couponUsedText}\`)` },
                { name: '送金リンク', value: `[スマホで受け取る](${paypayUrl})\n\`${paypayUrl}\`` }
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_${vmName}_${pName}_${interaction.user.id}_${inputCoupon || 'none'}`).setLabel('✅ 決済承認（発送）').setStyle(ButtonStyle.Success)
        );
        await notifyChannel.send({ embeds: [adminEmbed], components: [row] });
        await interaction.followUp({ embeds: [createEmbed('⏳ 申請完了', '運営の承認をお待ちください。')], ephemeral: true });
    },
    async handleApprove(interaction) {
        await interaction.deferUpdate();
        const [ , vmName, pName, buyerId, usedCoupon] = interaction.customId.split('_');
        const vm = DB.vending[vmName];
        const product = vm ? vm.products[pName] : null;
        if (!product || product.stock === 0) return interaction.followUp({ content: '❌ 在庫切れ、または商品消失。', ephemeral: true });
        try {
            const buyer = await interaction.client.users.fetch(buyerId);
            if (product.stock > 0) product.stock--;
            await buyer.send({ embeds: [createEmbed('🛍️ ご購入ありがとうございました！', `**${pName}** です。\n\n🔑 **データ:**\n${product.content}`)] });
            if (product.roleId) {
                const guild = interaction.guild;
                const member = await guild.members.fetch(buyerId).catch(() => null);
                if (member) await member.roles.add(product.roleId);
            }
            if (usedCoupon !== 'none' && DB.coupons[usedCoupon]) delete DB.coupons[usedCoupon];
            saveDB();
            await interaction.message.edit({ embeds: [createEmbed('✅ 発送処理完了', `ユーザー <@${buyerId}> への発送を完了しました。`)], components: [] });
            const config = getConfig();
            if (config.buyLogChannel) {
                const logCh = interaction.client.channels.cache.get(config.buyLogChannel);
                if (logCh) {
                    const logEmbed = createEmbed('🛒 商品購入ログ', `発送完了`)
                        .addFields(
                            { name: '購入者', value: `<@${buyerId}>` },
                            { name: '商品名', value: `\`${pName}\`` },
                            { name: '使用クーポン', value: usedCoupon !== 'none' ? `\`${usedCoupon.substring(0,8)}...\`` : 'なし' }
                        ).setTimestamp();
                    await logCh.send({ embeds: [logEmbed] });
                }
            }
        } catch (err) {
            if (product.stock !== -1) product.stock++;
            saveDB();
            await interaction.followUp({ content: '❌ DM送信エラーのためロールバック。', ephemeral: true });
        }
    },
    async deployFree(interaction) {
        const prize = interaction.options.getString('prize');
        const content = interaction.options.getString('content');
        const panelId = `free_${Date.now()}`;
        DB.giveaways[panelId] = { prize, content, claimedUsers: [] };
        saveDB();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`claim_${panelId}`).setLabel('🎁 無料で受け取る').setStyle(ButtonStyle.Success));
        await interaction.channel.send({ embeds: [createEmbed('🎉 無料配布キャンペーン', `🎁 景品: **${prize}**\n\n⚠️事前に \`/paypaylogin\` が必須です。`)], components: [row] });
        await interaction.reply({ embeds: [createEmbed('⚙️ システム', '配布パネルを設置しました。')], ephemeral: true });
    },
    async handleClaim(interaction) {
        if (isNotLoggedIn(interaction)) return;
        const panelId = interaction.customId.replace('claim_', '');
        const giveaway = DB.giveaways[panelId];
        if (!giveaway) return interaction.reply({ content: '❌ 存在しません。', ephemeral: true });
        if (giveaway.claimedUsers.includes(interaction.user.id)) return interaction.reply({ embeds: [createEmbed('⚠️ 獲得済み', 'お1人様1回までです。')], ephemeral: true });
        try {
            await interaction.user.send({ embeds: [createEmbed('🎁 無料配布お届け', `景品: **${giveaway.prize}**\n\n🔑 **データ:**\n${giveaway.content}`)] });
            giveaway.claimedUsers.push(interaction.user.id);
            saveDB();
            return interaction.reply({ embeds: [createEmbed('🟩 成功', 'DMに送信しました！')], ephemeral: true });
        } catch (e) {
            return interaction.reply({ content: '❌ DMが閉じています。', ephemeral: true });
        }
    },
    async rerollGiveaway(interaction) {
        const prizeName = interaction.options.getString('prize_name');
        const panelId = Object.keys(DB.giveaways).find(id => DB.giveaways[id].prize === prizeName);
        const giveaway = DB.giveaways[panelId];
        if (!giveaway || giveaway.claimedUsers.length === 0) return interaction.reply({ content: '❌ 対象データまたは応募者がいません。', ephemeral: true });
        const winner = giveaway.claimedUsers[Math.floor(Math.random() * giveaway.claimedUsers.length)];
        await interaction.reply({ embeds: [createEmbed('🎲 再抽選完了', `新当選者: <@${winner}> さん🎉`)] });
        return interaction.channel.send(`🎊 **再抽選発表** 🎊\n<@${winner}> さんに 『**${giveaway.prize}**』 が当選しました！`);
    }
};