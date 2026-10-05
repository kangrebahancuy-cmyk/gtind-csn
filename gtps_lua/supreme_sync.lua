-- GTIND CASINO - GTPS CLOUD BRIDGE
-- Website SQLite is the ONLY casino wallet authority.
-- No casino balance is stored on the GTPS server.
--
-- HTTP methods:
--   http:get(url, headers)
--   http:post(url, headers, postData)
--
-- Player methods used:
--   player:getName()
--   player:getInventoryItemCount(itemId)
--   player:removeItem(itemId, amount)
--   player:giveItem(itemId, amount)

local WEB_API_URL = "https://YOUR-CASINO-DOMAIN.com/api"
local SECRET_KEY = "REPLACE_WITH_GTPS_WEBHOOK_SECRET"

local ITEM_WL = 242
local ITEM_DL = 1796
local ITEM_BGL = 7188

local JSON_HEADERS = {
    ["Content-Type"] = "application/json",
    ["Accept"] = "application/json",
    ["x-gtps-secret"] = SECRET_KEY
}

local transactionCounter = 0

local function clean(v)
    return tostring(v or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function jsonEscape(v)
    return tostring(v or ""):gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("[\r\n]", " ")
end

local function jsonString(v)
    return '"' .. jsonEscape(v) .. '"'
end

local function jsonNumber(v)
    return tostring(math.floor(tonumber(v) or 0))
end

local function jsonStringField(body, key)
    return tostring(body or ""):match('"' .. key .. '"%s*:%s*"([^"]*)"')
end

local function jsonNumberField(body, key)
    return tonumber(tostring(body or ""):match('"' .. key .. '"%s*:%s*(-?[%d%.]+)'))
end

local function jsonBooleanField(body, key)
    return tostring(body or ""):match('"' .. key .. '"%s*:%s*true') ~= nil
end

local function urlEncode(v)
    return tostring(v or ""):gsub("([^%w%-%._~])", function(ch)
        return string.format("%%%02X", string.byte(ch))
    end)
end

local function nextTransactionId(player, currency, amount)
    transactionCounter = transactionCounter + 1
    return "gtps_" .. string.lower(clean(player:getName())) .. "_" ..
        string.lower(clean(currency)) .. "_" .. tostring(math.floor(tonumber(amount) or 0)) ..
        "_" .. tostring(os.time()) .. "_" .. tostring(transactionCounter)
end

local function asyncGet(url, callback)
    if not http then
        print("[GTIND] HTTP API tidak tersedia.")
        callback(false, "", -1)
        return
    end

    coroutine.wrap(function()
        local body, status = http:get(url, JSON_HEADERS)
        callback(status == 200, tostring(body or ""), status)
    end)()
end

local function asyncPost(url, payload, callback)
    if not http then
        print("[GTIND] HTTP API tidak tersedia.")
        callback(false, "", -1)
        return
    end

    coroutine.wrap(function()
        local body, status = http:post(url, JSON_HEADERS, tostring(payload or "{}"))
        callback(status == 200 or status == 201 or status == 202, tostring(body or ""), status)
    end)()
end

local function linkAccount(player, code)
    local growId = clean(player:getName())
    code = clean(code):gsub("%D", "")

    if #code ~= 6 then
        player:onConsoleMessage("[GTIND] Kode link harus 6 digit.")
        return
    end

    asyncGet(WEB_API_URL .. "/gtps/check-link?code=" .. urlEncode(code),
        function(ok, body, status)
            if not ok then
                player:onConsoleMessage("[GTIND] Gagal menghubungi website. HTTP " .. tostring(status))
                return
            end

            local registered = jsonBooleanField(body, "registered")
            local username = jsonStringField(body, "username")

            if not registered or not username or username == "" then
                player:onConsoleMessage("[GTIND] Kode link tidak valid.")
                return
            end

            local payload = "{" ..
                '"code":' .. jsonString(code) .. "," ..
                '"growid":' .. jsonString(growId) ..
            "}"

            asyncPost(WEB_API_URL .. "/gtps/link-growid", payload,
                function(linkOk, linkBody, linkStatus)
                    if not linkOk or not jsonBooleanField(linkBody, "success") then
                        player:onConsoleMessage(
                            "[GTIND] Link gagal: " ..
                            tostring(jsonStringField(linkBody, "error") or ("HTTP " .. tostring(linkStatus)))
                        )
                        return
                    end

                    player:onConsoleMessage(
                        "[GTIND] GrowID " .. growId ..
                        " berhasil terhubung ke akun " .. username .. "."
                    )
                end
            )
        end
    )
end

local function deposit(player, amount, currency)
    local growId = clean(player:getName())
    amount = math.floor(tonumber(amount) or 0)
    currency = string.upper(clean(currency or "DL"))

    if amount <= 0 then
        player:onConsoleMessage("[GTIND] Jumlah deposit tidak valid.")
        return
    end

    local itemId
    if currency == "WL" then
        itemId = ITEM_WL
    elseif currency == "DL" then
        itemId = ITEM_DL
    elseif currency == "BGL" then
        itemId = ITEM_BGL
    else
        player:onConsoleMessage("[GTIND] Currency harus WL, DL atau BGL.")
        return
    end

    local inventory = tonumber(player:getInventoryItemCount(itemId)) or 0
    if inventory < amount then
        player:onConsoleMessage(
            "[GTIND] Item tidak cukup. Kamu punya " ..
            tostring(inventory) .. " " .. currency .. "."
        )
        return
    end

    local transactionId = nextTransactionId(player, currency, amount)

    player:removeItem(itemId, amount)

    local payload = "{" ..
        '"transactionId":' .. jsonString(transactionId) .. "," ..
        '"growId":' .. jsonString(growId) .. "," ..
        '"currency":' .. jsonString(currency) .. "," ..
        '"amount":' .. jsonNumber(amount) ..
    "}"

    asyncPost(WEB_API_URL .. "/gtps/deposit-webhook", payload,
        function(ok, body, status)
            if not ok or not jsonBooleanField(body, "ok") then
                player:giveItem(itemId, amount)
                player:onConsoleMessage(
                    "[GTIND] Deposit gagal dan item dikembalikan. HTTP " .. tostring(status)
                )
                return
            end

            player:onConsoleMessage(
                "[GTIND] Deposit berhasil: " .. tostring(amount) .. " " .. currency .. "."
            )
        end
    )
end

local function confirmWithdrawal(player, withdrawalId, claimToken)
    local growId = clean(player:getName())

    local payload = "{" ..
        '"withdrawalId":' .. jsonString(withdrawalId) .. "," ..
        '"claimToken":' .. jsonString(claimToken) .. "," ..
        '"growId":' .. jsonString(growId) ..
    "}"

    asyncPost(WEB_API_URL .. "/gtps/withdraw-confirm", payload,
        function(ok, body, status)
            if not ok or not jsonBooleanField(body, "ok") then
                player:onConsoleMessage(
                    "[GTIND] WARNING: item sudah diberikan tetapi confirm website gagal. Hubungi admin."
                )
                print(
                    "[GTIND] CRITICAL withdrawal confirm failed: " ..
                    tostring(withdrawalId) .. " HTTP=" .. tostring(status)
                )
                return
            end

            player:onConsoleMessage("[GTIND] Withdrawal berhasil dikonfirmasi.")
        end
    )
end

local function failWithdrawal(player, withdrawalId, claimToken, reason)
    local payload = "{" ..
        '"withdrawalId":' .. jsonString(withdrawalId) .. "," ..
        '"claimToken":' .. jsonString(claimToken) .. "," ..
        '"reason":' .. jsonString(reason or "gtps_item_delivery_failed") ..
    "}"

    asyncPost(WEB_API_URL .. "/gtps/withdraw-fail", payload,
        function(ok, body, status)
            if ok and jsonBooleanField(body, "ok") then
                player:onConsoleMessage("[GTIND] Withdrawal gagal; saldo dikembalikan website.")
            else
                player:onConsoleMessage("[GTIND] Refund belum terkonfirmasi. Hubungi admin.")
                print(
                    "[GTIND] CRITICAL withdrawal fail failed: " ..
                    tostring(withdrawalId) .. " HTTP=" .. tostring(status)
                )
            end
        end
    )
end

local function processWithdrawal(player)
    local growId = clean(player:getName())

    asyncGet(
        WEB_API_URL .. "/gtps/withdraw-pending?growId=" .. urlEncode(growId),
        function(ok, body, status)
            if not ok then
                player:onConsoleMessage(
                    "[GTIND] Gagal mengambil withdrawal. HTTP " .. tostring(status)
                )
                return
            end

            if not jsonBooleanField(body, "ok") then
                player:onConsoleMessage(
                    "[GTIND] Withdrawal poll gagal: " ..
                    tostring(jsonStringField(body, "error") or "unknown_error")
                )
                return
            end

            if not jsonBooleanField(body, "pending") then
                player:onConsoleMessage(
                    "[GTIND] Tidak ada withdrawal pending. Buat withdrawal dari Wallet website."
                )
                return
            end

            local withdrawalId = jsonStringField(body, "withdrawalId")
            local claimToken = jsonStringField(body, "claimToken")
            local currency = string.upper(jsonStringField(body, "currency") or "")
            local amount = math.floor(jsonNumberField(body, "amount") or 0)

            if not withdrawalId or not claimToken or amount <= 0 then
                player:onConsoleMessage("[GTIND] Data withdrawal website tidak lengkap.")
                return
            end

            local itemId
            if currency == "WL" then
                itemId = ITEM_WL
            elseif currency == "DL" then
                itemId = ITEM_DL
            elseif currency == "BGL" then
                itemId = ITEM_BGL
            else
                failWithdrawal(player, withdrawalId, claimToken, "unsupported_currency")
                return
            end

            player:giveItem(itemId, amount)

            player:onConsoleMessage(
                "[GTIND] " .. tostring(amount) .. " " .. currency ..
                " diberikan. Mengonfirmasi withdrawal..."
            )

            confirmWithdrawal(player, withdrawalId, claimToken)
        end
    )
end

local function showHelp(player)
    player:onConsoleMessage("[GTIND] /casino - bantuan")
    player:onConsoleMessage("[GTIND] /link <kode> - hubungkan GrowID")
    player:onConsoleMessage("[GTIND] /deposit <jumlah> <wl|dl|bgl> - deposit")
    player:onConsoleMessage("[GTIND] /withdraw - ambil withdrawal pending dari website")
    player:onConsoleMessage("[GTIND] /balance - info wallet")
end

local function handleCommand(player, command, args)
    local cmd = string.lower(clean(command)):gsub("^/", "")
    local arg = clean(args)

    if cmd == "casino" or cmd == "gtind" or cmd == "supreme" or cmd == "casinohelp" then
        showHelp(player)
        return true
    end

    if cmd == "link" then
        linkAccount(player, arg)
        return true
    end

    if cmd == "deposit" or cmd == "dep" then
        local amountString, currency = arg:match("^(%d+)%s*(%a*)$")
        local amount = tonumber(amountString) or 0
        currency = string.lower(currency or "")
        if currency == "" then currency = "dl" end
        deposit(player, amount, currency)
        return true
    end

    if cmd == "withdraw" or cmd == "wd" then
        processWithdrawal(player)
        return true
    end

    if cmd == "balance" or cmd == "bal" then
        player:onConsoleMessage(
            "[GTIND] Saldo casino dikelola website. Buka Wallet GTIND untuk saldo WL/DL/BGL."
        )
        return true
    end

    return false
end

if type(onPlayerCommandCallback) == "function" then
    onPlayerCommandCallback(function(world, player, fullCommand)
        if type(fullCommand) ~= "string" then
            return false
        end

        local command, args = fullCommand:match("^(%S+)%s*(.*)$")
        if not command then
            return false
        end

        return handleCommand(player, command, args or "")
    end)
end

print("[GTIND] Casino bridge loaded.")
print("[GTIND] Website SQLite is the casino wallet authority.")
print("[GTIND] Local GTPS casino balance storage is disabled.")
