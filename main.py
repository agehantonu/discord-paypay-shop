import discord
from discord.ext import commands
from discord import app_commands
import random
import asyncio
import time

intents = discord.Intents.default()
intents.message_content = True
intents.members = True

class SuperBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix="!", intents=intents)
        
    async def setup_hook(self):

        self.add_view(TicketOpenButton())

bot = SuperBot()

THEME_COLOR = discord.Color(0x242929)

DB = {
    "users": {},
    "vending": {},
    "canned": {},
    "analytics": {
        "total_sales": 0,
        "tickets_created": 0
    }
}

def get_user_data(user_id: int):
    if user_id not in DB["users"]:
        DB["users"][user_id] = {"points": 0, "warnings": 0}
    return DB["users"][user_id]

def create_embed(title: str, description: str) -> discord.Embed:
    """テーマカラーを適用した標準埋め込みを作成するヘルパー関数"""
    return discord.Embed(title=title, description=description, color=THEME_COLOR)


class PayPayChargeModal(discord.ui.Modal, title="PayPayアカウント連携・チャージ"):
    paypay_id = discord.ui.TextInput(label="PayPay ID または 携帯電話番号", placeholder="090-XXXX-XXXX")
    amount = discord.ui.TextInput(label="チャージ希望金額（円）", placeholder="1000")

    def __init__(self, paypay_channel_id):
        super().__init__()
        self.paypay_channel_id = paypay_channel_id

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            charge_amount = int(self.amount.value)
        except ValueError:
            embed = create_embed("❌ エラー", "金額には半角数字を入力してください。")
            return await interaction.followup.send(embed=embed, ephemeral=True)

        ch = bot.get_channel(self.paypay_channel_id)
        if not ch:
            embed = create_embed("❌ エラー", "管理用通知チャンネルが見つかりません。")
            return await interaction.followup.send(embed=embed, ephemeral=True)

        embed = create_embed("💳 PayPayチャージ承認要求", f"ユーザー: {interaction.user.mention} ({interaction.user.id})\nログイン試行ID: `{self.paypay_id.value}`")
        embed.add_field(name="チャージ申請額", value=f"**{charge_amount} 円**")
        
        view = PayPayApproveView(interaction.user.id, charge_amount)
        await ch.send(embed=embed, view=view)
        
        success_embed = create_embed("🟩 リクエスト送信完了", "PayPayのログイン・送金要求を送信しました。\n運営が確認・承認するとポイントが反映されます。")
        await interaction.followup.send(embed=success_embed, ephemeral=True)

class PayPayApproveView(discord.ui.View):
    def __init__(self, applicant_id, amount):
        super().__init__(timeout=None)
        self.applicant_id = applicant_id
        self.amount = amount

    @discord.ui.button(label="✅ 送金を確認・承認", style=discord.ButtonStyle.success)
    async def approve(self, interaction: discord.Interaction):
        u_data = get_user_data(self.applicant_id)
        u_data["points"] += self.amount
        DB["analytics"]["total_sales"] += self.amount
        
        for item in self.children:
            item.disabled = True
        await interaction.response.edit_message(view=self)

        confirm_embed = create_embed("✅ 承認完了", f"ユーザー(<@{self.applicant_id}>)に {self.amount} ポイントをチャージしました。")
        await interaction.followup.send(embed=confirm_embed)
        
        try:
            user = await bot.fetch_user(self.applicant_id)
            dm_embed = create_embed("💳 チャージ完了", f"PayPayからのチャージが完了しました！\n現在の保有残高: `{u_data['points']}` ポイント")
            await user.send(embed=dm_embed)
        except:
            pass

class VendingProductSelect(discord.ui.Select):
    def __init__(self, vm_name, products):
        options = [
            discord.SelectOption(label=f"{p_name} ({p_data['price']}P) 在庫:{'∞' if p_data['stock']==-1 else p_data['stock']}", value=p_name)
            for p_name, p_data in products.items() if p_data['stock'] != 0
        ]
        super().__init__(placeholder="購入する商品を選択...", options=options)
        self.vm_name = vm_name

    async def callback(self, interaction: discord.Interaction):
        product_name = self.values[0]
        vm = DB["vending"].get(self.vm_name)
        product = vm["products"].get(product_name)
        u_data = get_user_data(interaction.user.id)

        if u_data["points"] < product["price"]:
            err_embed = create_embed("❌ 残高不足", f"ポイントが足りません。\n現在の残高: `{u_data['points']}` P / 必要: `{product['price']}` P\n「PayPayチャージ」ボタンからチャージしてください。")
            return await interaction.response.send_message(embed=err_embed, ephemeral=True)

        if product["stock"] > 0:
            product["stock"] -= 1

        u_data["points"] -= product["price"]

        try:
            dm_embed = create_embed("🛍️ 購入完了", f"**【{product_name}】**の購入が完了しました！\n\n🔑 商品データ・リンク:\n{product['content_link']}")
            await interaction.user.send(embed=dm_embed)
            
            if product.get("role"):
                member = interaction.guild.get_member(interaction.user.id)
                if member: await member.add_roles(product["role"])
                
            success_embed = create_embed("🟩 発送完了", f"商品をDMで即時送付しました！\n現在の残高: `{u_data['points']}` P")
            await interaction.response.send_message(embed=success_embed, ephemeral=True)
        except:
            u_data["points"] += product["price"] 
            if product["stock"] != -1: product["stock"] += 1
            err_dm = create_embed("❌ 発送失敗", "DMを送信できませんでした。設定で「サーバーからのDM」を許可して再度お試しください。")
            await interaction.response.send_message(embed=err_dm, ephemeral=True)

class VendingMainView(discord.ui.View):
    def __init__(self, vm_name, paypay_ch):
        super().__init__(timeout=None)
        self.vm_name = vm_name
        self.paypay_ch = paypay_ch
        vm = DB["vending"].get(vm_name)
        if vm and vm["products"]:
            self.add_item(VendingProductSelect(vm_name, vm["products"]))

    @discord.ui.button(label="💳 PayPayから残高をチャージ", style=discord.ButtonStyle.primary, row=1)
    async def charge_points(self, interaction: discord.Interaction):
        await interaction.response.send_modal(PayPayChargeModal(self.paypay_ch))

    @discord.ui.button(label="💰 現在の残高確認", style=discord.ButtonStyle.secondary, row=1)
    async def check_balance(self, interaction: discord.Interaction):
        u_data = get_user_data(interaction.user.id)
        bal_embed = create_embed("💰 残高確認", f"{interaction.user.mention} さんの現在の残高:\n**{u_data['points']}** ポイント")
        await interaction.response.send_message(embed=bal_embed, ephemeral=True)

@bot.tree.command(name="vm_create", description="【自販機】新規作成")
@app_commands.checks.has_permissions(administrator=True)
async def vm_create(interaction: discord.Interaction, name: str, paypay_channel: discord.TextChannel):
    DB["vending"][name] = {"paypay_channel": paypay_channel.id, "products": {}}
    embed = create_embed("🛒 自販機作成", f"自販機 `{name}` を作成しました。")
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="vm_add_product", description="【自販機】商品追加")
@app_commands.checks.has_permissions(administrator=True)
async def vm_add_product(interaction: discord.Interaction, vm_name: str, name: str, price: int, content_link: str, stock: int, role: discord.Role = None):
    if vm_name not in DB["vending"]: 
        return await interaction.response.send_message(embed=create_embed("❌ エラー", "自販機が見つかりません。"), ephemeral=True)
    DB["vending"][vm_name]["products"][name] = {"price": price, "content_link": content_link, "stock": stock, "role": role}
    embed = create_embed("📦 商品追加完了", f"`{vm_name}` に商品 `{name}` を追加しました。")
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="deploy_vending", description="【自販機】パネル設置")
@app_commands.checks.has_permissions(administrator=True)
async def deploy_vending(interaction: discord.Interaction, name: str):
    vm = DB["vending"].get(name)
    if not vm: 
        return await interaction.response.send_message(embed=create_embed("❌ エラー", "自販機が見つかりません。"), ephemeral=True)
    embed = create_embed(f"🛒 {name} 自動販売機", "PayPayアカウント連携で残高をチャージし、商品を購入してください。")
    await interaction.response.send_message(embed=create_embed("⚙️ システム", "パネルを設置しました。"), ephemeral=True)
    await interaction.channel.send(embed=embed, view=VendingMainView(name, vm["paypay_channel"]))


class TicketCreateModal(discord.ui.Modal, title="お問い合わせ詳細入力"):
    subject = discord.ui.TextInput(label="件名 / 問い合わせのタイトル", placeholder="例：不具合報告について")
    details = discord.ui.TextInput(label="詳しい内容", style=discord.TextStyle.paragraph, placeholder="こちらに詳細を記述してください。")

    def __init__(self, support_role_id):
        super().__init__()
        self.support_role_id = support_role_id

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        DB["analytics"]["tickets_created"] += 1
        
        thread = await interaction.channel.create_thread(
            name=f"🎫-{interaction.user.name}-{self.subject.value[:10]}",
            type=discord.ChannelType.private_thread
        )
        await thread.add_user(interaction.user)
        
        embed = create_embed(f"🎫 お問い合わせ: {self.subject.value}", f"**相談者:** {interaction.user.mention}\n\n**内容詳細:**\n{self.details.value}")
        mention_str = f"<@&{self.support_role_id}>" if self.support_role_id else "@here"
        
        class TicketCloseView(discord.ui.View):
            @discord.ui.button(label="🔒 チケットを閉じる", style=discord.ButtonStyle.danger)
            async def close(self, inter: discord.Interaction):
                await inter.response.send_message(embed=create_embed("🗄️ アーカイブ", "このスレッドをアーカイブして終了します。"))
                await thread.edit(archived=True, locked=True)

        await thread.send(f"🔔 {mention_str}", embed=embed, view=TicketCloseView())
        await interaction.followup.send(embed=create_embed("✅ 作成完了", f"チケットスレッドを作成しました: {thread.mention}"), ephemeral=True)

class TicketOpenButton(discord.ui.View):
    def __init__(self, support_role_id=None):
        super().__init__(timeout=None)
        self.support_role_id = support_role_id

    @discord.ui.button(label="🎫 お問い合わせを開始する", style=discord.ButtonStyle.primary, custom_id="open_ticket_v3")
    async def open_ticket(self, interaction: discord.Interaction):
        await interaction.response.send_modal(TicketCreateModal(self.support_role_id))

@bot.tree.command(name="ticket_setup", description="【チケット】チケットパネルを配置")
@app_commands.checks.has_permissions(administrator=True)
async def ticket_setup(interaction: discord.Interaction, support_role: discord.Role = None):
    embed = create_embed("🎫 サポート窓口", "ご相談・お問い合わせは下のボタンを押して、必要事項をご記入ください。")
    view = TicketOpenButton(support_role.id if support_role else None)
    await interaction.channel.send(embed=embed, view=view)
    await interaction.response.send_message(embed=create_embed("⚙️ システム", "チケットパネルを設置しました。"), ephemeral=True)


@bot.tree.command(name="giveaway_start", description="【企画】プレゼント抽選会を開始")
@app_commands.checks.has_permissions(administrator=True)
async def giveaway_start(interaction: discord.Interaction, title: str, prize: str, winners: int, duration_minutes: int):
    end_timestamp = int(time.time()) + (duration_minutes * 60)
    
    embed = create_embed(f"🎉 {title}", f"🎁 賞品: **{prize}**\n👤 当選人数: `{winners}`名\n⏱️ 終了予定: <t:{end_timestamp}:R>")
    
    class GiveawayJoinView(discord.ui.View):
        def __init__(self):
            super().__init__(timeout=None)
            self.participants = []

        @discord.ui.button(label="🎉 応募する", style=discord.ButtonStyle.success, custom_id="join_g_v3")
        async def join(self, inter: discord.Interaction):
            if inter.user.id in self.participants:
                return await inter.response.send_message(embed=create_embed("⚠️ エントリー済み", "すでにエントリー済みです。"), ephemeral=True)
            self.participants.append(inter.user.id)
            await inter.response.send_message(embed=create_embed("✅ 応募受付", "正常に応募が受け付けられました！"), ephemeral=True)

    view = GiveawayJoinView()
    await interaction.response.send_message(embed=create_embed("⚙️ システム", "企画を開始しました。"), ephemeral=True)
    panel_msg = await interaction.channel.send(embed=embed, view=view)
    
    await asyncio.sleep(duration_minutes * 60)
    
    if view.participants:
        lucky_winners = random.sample(view.participants, min(len(view.participants), winners))
        winner_mentions = ", ".join([f"<@{w_id}>" for w_id in lucky_winners])
        
        end_embed = create_embed(f"🏁 【終了】{title}", f"🎁 賞品: **{prize}**\n🎉 当選者: {winner_mentions}")
        await panel_msg.edit(embed=end_embed, view=None)
        await interaction.channel.send(f"🎊 **Giveaway結果発表** 🎊\n{winner_mentions} さんに 『**{prize}**』 が当選しました！")
    else:
        await interaction.channel.send(embed=create_embed("😭 終了", f"『{prize}』の企画は参加者がいなかったため終了しました。"))



class VerificationView(discord.ui.View):
    def __init__(self, role_id=None, v_type=None):
        super().__init__(timeout=None)
        self.role_id = role_id
        self.v_type = v_type

    @discord.ui.button(label="🔐 認証を始める", style=discord.ButtonStyle.secondary, custom_id="start_auth_v3")
    async def auth_start(self, interaction: discord.Interaction):
        role = interaction.guild.get_role(self.role_id) if self.role_id else interaction.guild.roles[-1]

        if self.v_type == "button" or not self.v_type:
            await interaction.user.add_roles(role)
            await interaction.response.send_message(embed=create_embed("✅ 認証成功", "ボタン認証に成功しました！ロールを付与しました。"), ephemeral=True)

        elif self.v_type == "math":
            a, b = random.randint(5, 15), random.randint(1, 9)
            correct = a + b
            class MathVerify(discord.ui.Modal, title="計算認証ゲート"):
                ans = discord.ui.TextInput(label=f"計算を解いてください: {a} + {b} = ?")
                async def on_submit(self, inter: discord.Interaction):
                    if self.ans.value.strip() == str(correct):
                        await inter.user.add_roles(role)
                        await inter.response.send_message(embed=create_embed("✅ 認証成功", "正解です！認証が完了しました。"), ephemeral=True)
                    else:
                        await inter.response.send_message(embed=create_embed("❌ 認証失敗", "不正解です。最初からやり直してください。"), ephemeral=True)
            await interaction.response.send_modal(MathVerify())

        elif self.v_type == "emoji":
            emojis = ["😎", "🤯", "😽", "☺", "🤔"] # 絵文字を増やそう
            target = random.choice(emojis)
            
            class EmojiSelect(discord.ui.Select):
                def __init__(self):
                    super().__init__(placeholder=f"【 {target} 】を選択してください", options=[discord.SelectOption(label=e, value=e) for e in emojis])
                async def callback(self, inter: discord.Interaction):
                    if self.values[0] == target:
                        await inter.user.add_roles(role)
                        await inter.response.send_message(embed=create_embed("✅ 認証成功", "絵文字が一致しました！"), ephemeral=True)
                    else:
                        await inter.response.send_message(embed=create_embed("❌ 認証失敗", "違った絵文字です。"), ephemeral=True)
            
            view = discord.ui.View()
            view.add_item(EmojiSelect())
            await interaction.response.send_message(embed=create_embed("🧩 絵文字認証", "下のセレクトメニューから指定された絵文字を選んでください。"), view=view, ephemeral=True)

        elif self.v_type == "dm":
            code = str(random.randint(1000, 9999))
            try:
                dm_emb = create_embed("🔐 認証コード", f"あなたの認証コードは **{code}** です。")
                await interaction.user.send(embed=dm_emb)
                
                class DMVerify(discord.ui.Modal, title="DMコード確認入力"):
                    u_code = discord.ui.TextInput(label="DMに届いた4桁の数字を入力")
                    async def on_submit(self, inter: discord.Interaction):
                        if self.u_code.value.strip() == code:
                            await inter.user.add_roles(role)
                            await inter.response.send_message(embed=create_embed("✅ 認証成功", "コードが一致しました！"), ephemeral=True)
                        else:
                            await inter.response.send_message(embed=create_embed("❌ 認証失敗", "コードが一致しません。"), ephemeral=True)
                await interaction.response.send_modal(DMVerify())
            except:
                await interaction.response.send_message(embed=create_embed("❌ 送信エラー", "DMが閉じられているためコードを送れませんでした。"), ephemeral=True)

@bot.tree.command(name="verify_setup", description="【認証】各種認証パネルの配置")
@app_commands.choices(type=[
    app_commands.Choice(name="簡単ボタン認証", value="button"),
    app_commands.Choice(name="算数計算認証", value="math"),
    app_commands.Choice(name="ランダム絵文字一致認証", value="emoji"),
    app_commands.Choice(name="DM4桁シークレットコード認証", value="dm"),
])
@app_commands.checks.has_permissions(administrator=True)
async def verify_setup(interaction: discord.Interaction, role: discord.Role, type: app_commands.Choice[str]):
    embed = create_embed("🔐 セキュリティゲート", f"当サーバーに入るには認証が必要です。\n方式: **{type.name}**")
    await interaction.channel.send(embed=embed, view=VerificationView(role.id, type.value))
    await interaction.response.send_message(embed=create_embed("⚙️ システム", "認証パネルを展開しました。"), ephemeral=True)


@bot.tree.command(name="dashboard", description="【管理】現在の稼働・売上データを可視化")
@app_commands.checks.has_permissions(administrator=True)
async def dashboard(interaction: discord.Interaction):
    guild = interaction.guild
    embed = create_embed(f"📊 {guild.name} 総合アナリティクス", "現在のサーバー稼働データです。")
    embed.add_field(name="👥 総メンバー数", value=f"`{guild.member_count}` 名")
    embed.add_field(name="💳 自販機総売上高", value=f"`{DB['analytics']['total_sales']}` 円相当")
    embed.add_field(name="🎫 累計サポートチケット数", value=f"`{DB['analytics']['tickets_created']}` 件")
    embed.add_field(name="🤖 応答レイテンシ", value=f"`{round(bot.latency * 1000)}ms`")
    await interaction.response.send_message(embed=embed, ephemeral=True)



@bot.command()
@commands.is_owner()
async def sync(ctx):
    await bot.tree.sync()
    await ctx.send(embed=create_embed("🔄 同期完了", "スラッシュコマンドの同期が完了しました。"))

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.name}")

bot.run("YOUR_BOT_TOKEN")