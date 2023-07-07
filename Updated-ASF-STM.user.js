// ==UserScript==
// @name          Updated ASF STM
// @namespace     https://greasyfork.org/users/738914
// @description   ASF bot list trade matcher
// @license       Apache-2.0
// @author        Ryzhehvost
// @contributor   iBreakEverything
// @updateURL     https://github.com/iBreakEverything/Updated-ASF-STM/releases/latest/download/Updated-ASF-STM.user.js
// @downloadURL   https://github.com/iBreakEverything/Updated-ASF-STM/releases/latest/download/Updated-ASF-STM.user.js
// @match         https://steamcommunity.com/id/*/badges
// @match         https://steamcommunity.com/id/*/badges/
// @match         https://steamcommunity.com/profiles/*/badges
// @match         https://steamcommunity.com/profiles/*/badges/
// @version       2.3.3
// @icon          https://raw.githubusercontent.com/iBreakEverything/Updated-ASF-STM/master/asf-stm.png
// @connect       asf.justarchi.net
// @grant         GM.xmlHttpRequest
// @grant         GM_xmlhttpRequest
// @grant         GM.setValue
// @grant         GM_setValue
// @grant         GM.getValue
// @grant         GM_getValue
// ==/UserScript==

(function() {
    "use strict";
    const TRADE_MESSAGE = `Trade was sent using Updated-ASF-STM script version ${GM_info.script.version}!`;
    const REQUEST_LIMITER = 3 * 1000;
    const INVENTORY_API_LIMITER = 5 * 1000;
    const ERROR_LIMITER = 5 * 1000;
    const DEBUG = false;
    const MAX_ERRORS = 1;
    const FILTER_BACKGROUND_COLOR = '#171A21E6';
    const BLACKLIST_NAME = 'blacklist';
    const MAX_CARDS_NAME = 'maxcards';
    const FAST_SCAN = true;
    let errors = 0;
    let blacklist = [];
    let bots;
    let assets = [];
    let myAssets = [];
    let descriptions = [];
    let myBadges = [];
    let botBadges = [];
    let maxPages;
    let stop = false;
    let sessionid = "";
    let steamLoginSecure = "";
    let storageMaxCards = [];
    let urlPath = null;

    function debugTime(name) {
        if (DEBUG) {
            console.time(name);
        }
    }

    function debugTimeEnd(name) {
        if (DEBUG) {
            console.timeEnd(name);
        }
    }

    function debugPrint(msg) {
        if (DEBUG) {
            console.log(msg);
        }
    }

    function deepClone(object) {
        return JSON.parse(JSON.stringify(object));
    }

    function getPartner(str) {
        if (typeof(BigInt)!=="undefined") {
            return (BigInt(str) % BigInt(4294967296)).toString(); // eslint-disable-line
        } else {
            let result = 0;
            for (let i = 0; i < str.length; i++) {
                result = (result * 10 + Number(str[i])) % 4294967296;
            }
            return result;
        }
    }

    function enableButton() {
        let button = document.getElementById("asf_stm_button");
        button.removeClassName('btn_disabled');
        button.addEventListener("click", buttonPressedEvent, false);
    }

    function disableButton() {
        let button = document.getElementById("asf_stm_button");
        button.addClassName('btn_disabled');
        button.removeEventListener("click", buttonPressedEvent, false);
    }

    function updateMessage(text) {
        let message = document.getElementById("asf_stm_message");
        message.textContent = text;
    }

    function hideMessage() {
        let messageBox = document.getElementById("asf_stm_messagebox");
        messageBox.setAttribute("style", "display: none;");
    }

    function hideThrobber() {
        let throbber = document.getElementById("throbber");
        throbber.setAttribute("style", "display: none;");
    }

    function updateProgress(index) {
        let bar = document.getElementById("asf_stm_progress");
        let progress = 100 * ((index + 1) / bots.length);
        bar.setAttribute("style", "width: " + progress + "%;");
    }

    function populateCards(item) {
        let classList = "";
        let htmlCards = "";
        for (let j = 0; j < item.cards.length; j++) {
            let itemIcon = item.cards[j].iconUrl;
            let itemName = item.cards[j].item.substring(item.cards[j].item.indexOf("-") + 1);
            for (let k = 0; k < item.cards[j].count; k++) {
                if (classList != "") {
                    classList += ";";
                }
                classList += item.cards[j].class;
                let cardTemplate = `
                          <div class="showcase_slot">
                            <img class="image-container" src="https://steamcommunity-a.akamaihd.net/economy/image/${itemIcon}/98x115">
                            <div class="commentthread_subscribe_hint" style="width: 98px;">${itemName}</div>
                          </div>
                `;
                htmlCards += cardTemplate;
            }
        }
        return {
            "htmlCards": htmlCards,
            "classList": classList
        };
    }

    function getClasses(item) {
        let classes = "";
        for (let j = 0; j < item.cards.length; j++) {
            for (let k = 0; k < item.cards[j].count; k++) {
                if (classes != "") {
                    classes += ";";
                }
                classes += item.cards[j].class;
            }
        }
        return classes;
    }

    function updateTrade(row) {
        let index = row.id.split("_")[1];
        let tradeLink = row.getElementsByClassName("full_trade_url")[0];
        let splitUrl = tradeLink.href.split("&");
        let them = "";
        let you = "";
        let filterWidget = document.getElementById("asf_stm_filters_body"); //TODO
        for (let i = 0; i < bots[index].itemsToSend.length; i++) {
            let appId = bots[index].itemsToSend[i].appId;
            let checkBox = document.getElementById("astm_" + appId);
            if (checkBox.checked) {
                if (you != "") {
                    you += ";";
                }
                you = you + getClasses(bots[index].itemsToSend[i]);
                if (them != "") {
                    them += ";";
                }
                them = them + getClasses(bots[index].itemsToReceive[i]);
            }
        }
        splitUrl[3] = "them=" + them;
        splitUrl[4] = "you=" + you;
        tradeLink.href = splitUrl.join("&");
    }

    function checkRow(row) {
        debugPrint("checkRow");
        let matches = row.getElementsByClassName("badge_row");
        let visible = false;
        for (let i = 0; i < matches.length; i++) {
            if (matches[i].parentElement.style.display != "none") {
                visible = true;
                break;
            }
        }
        if (visible) {
            row.style.display = "block";
            updateTrade(row);
        } else {
            row.style.display = "none";
        }
    }

    function addMatchRow(index, profile) {
        debugPrint("addMatchRow " + index);
        let itemsToSend = bots[index].itemsToSend;
        let itemsToReceive = bots[index].itemsToReceive;
        let tradeUrl = "https://steamcommunity.com/tradeoffer/new/?partner=" + getPartner(bots[index].SteamID) + "&token=" + bots[index].TradeToken + "&source=stm";
        let globalYou = "";
        let globalThem = "";
        let matches = "";
        let any = "";
        let appIdArray = [];
        if (bots[index].MatchEverything == true) {
            any = `&nbsp;<sup><span class="avatar_block_status_in-game" style="font-size: 8px; cursor:help;position: relative;top: -0.2em" title="This bots trades for any cards within same set">&nbsp;ANY&nbsp;</span></sup>`;
        }
        for (let i = 0; i < itemsToSend.length; i++) {
            let appId = itemsToSend[i].appId;
            let itemToReceive = itemsToReceive.find(a => a.appId == appId);
            let gameName = itemsToSend[i].title;
            let display = "inline-block";
            appIdArray.push("astm_" + appId);
            //remove placeholder
            let filterWidget = document.getElementById("asf_stm_filters_body");
            let placeholder = document.getElementById("asf_stm_placeholder");
            if (placeholder != null) {
                placeholder.remove();
            }
            //add filter
            let checkBox = document.getElementById("astm_" + appId);
            if (checkBox == null) {
                let newFilter = `
                <div style="flex:0 0 33.333333%;overflow:hidden;text-overflow:ellipsis;float:left;position:relative;min-height:1px;padding-bottom:3px;">
                  <label for="astm_${appId}" style="white-space:nowrap;">
                    <input type="checkbox" id="astm_${appId}" checked="" />
                    <span style="white-space:nowrap;">
                      ${gameName}
                    </span>
                  </label>
                </div>`;
                let spanTemplate = document.createElement("template");
                spanTemplate.innerHTML = newFilter.trim();
                filterWidget.appendChild(spanTemplate.content.firstChild);
            } else {
                if (checkBox.checked == false) {
                    display = "none";
                }
            }

            let sendResult = populateCards(itemsToSend[i]);
            let receiveResult = populateCards(itemToReceive);
            let tradeUrlApp = tradeUrl + "&them=" + receiveResult.classList + "&you=" + sendResult.classList;

            let matchTemplate = `
              <div class="asf_stm_appid_${appId}" style="display:${display}">
                <div class="badge_row is_link goo_untradable_note showcase_slot">
                  <div class="badge_content" style="display:grid;justify-content: center">
                    <div title="View ${gameName} badge progress" style="justify-content: center;display: flex">
                      <a target="_blank" href="${urlPath}gamecards/${appId}/">
                        <img alt="${gameName}" src="https://steamcdn-a.akamaihd.net/steam/apps/${appId}/capsule_184x69.jpg">
                      </a>
                    </div>
                    <div style="justify-content: space-between;display: flex;">
                      <a href="${tradeUrlApp}" target="_blank" rel="noopener">
                        <div class="btn_darkblue_white_innerfade btn_medium">
                          <span>
                            Offer a trade
                          </span>
                        </div>
                      </a>
                      <div class="btn_darkblue_white_innerfade btn_medium" onclick="filterAppId('astm_${appId}',false)">
                        <span>Filter</span>
                      </div>
                    </div>
                  </div>
                  <div class="showcase_slot">
                    <div class="showcase_slot profile_header">
                      <div class="badge_info_unlocked profile_xp_block_mid avatar_block_status_in-game badge_info_title badge_row_overlay" style="height: 15px;">You</div>
                      ${sendResult.htmlCards}
                    </div>
                    <span class="showcase_slot badge_info_title booster_creator_actions">
                      <h1>&#10145;</h1>
                    </span>
                  </div>
                  <div class="showcase_slot profile_header">
                    <div class="badge_info_unlocked profile_xp_block_mid avatar_block_status_online badge_info_title badge_row_overlay ellipsis" style="height: 15px;">
                      ${profile.username}
                    </div>
                    ${receiveResult.htmlCards}
                  </div>
                </div>
              </div>
            `;
            if (checkBox == null || checkBox.checked) {
                matches += matchTemplate;
                if (globalYou != "") {
                    globalYou += ";";
                }
                globalYou += sendResult.classList;
                if (globalThem != "") {
                    globalThem += ";";
                }
                globalThem += receiveResult.classList;
            }
        }

        let output = JSON.stringify(appIdArray).replace(/"/g, '#');
        let tradeUrlFull = tradeUrl + "&them=" + globalThem + "&you=" + globalYou;
        let invObject = inventoryCountParser(bots[index].TotalItemsCount);
        let rowTemplate = `
          <div id="asfstmbot_${index}" class="badge_row">
            <div class="badge_row_inner">
              <div class="badge_title_row guide_showcase_contributors">
                <div class="badge_title_stats">
                  <div class="btn_darkblue_white_innerfade btn_medium" id="send_${index}">
                    <span>
                      Send Trade Request
                    </span>
                  </div>
                  <div class="btn_darkblue_white_innerfade btn_medium" onclick="filterAppId('${output}',true)">
                    <span>
                      Filter all
                    </span>
                  </div>
                  <a class="full_trade_url" href="${tradeUrlFull}" id="full_trade_${index}" target="_blank" rel="noopener">
                    <div class="btn_darkblue_white_innerfade btn_medium">
                      <span>
                        Offer a trade for all
                      </span>
                    </div>
                  </a>
                  <div class="btn_darkred_white_innerfade btn_medium_thin" id="blacklist_${index}">
                    <span>
                      🚫
                    </span>
                  </div>
                </div>
                <div class="badge_title">
                  <div style="display:flex">
                    <div class="playerAvatar ${profile.onlineState}" style="margin-right:5px;">
                      <a href="https://steamcommunity.com/profiles/${bots[index].SteamID}/" target="_blank" rel="noopener">
                        <img src="${profile.avatar}">
                      </a>
                    </div>
                    <a href="https://steamcommunity.com/profiles/${bots[index].SteamID}/" target="_blank" rel="noopener"><span>${profile.username}</span></a>
                    ${any}
                    <span style="font-size:16px;color:${invObject.color};margin-left:5px;">${invObject.number} items</span>
                  </div>
                </div>
              </div>
              <div class="badge_title_rule"></div>
              ${matches}
            </div>
          </div>
        `;
        let template = document.createElement("template");
        template.innerHTML = rowTemplate.trim();
        let mainContentDiv = document.getElementsByClassName("maincontent")[0];
        let newChild = template.content.firstChild;
        mainContentDiv.appendChild(newChild);
        checkRow(newChild);
        document.querySelector(`#send_${index}`).addEventListener("click", sendPostRequest.bind(null, index), false);
        document.querySelector(`#blacklist_${index}`).addEventListener("click", confirmAddToBlacklist.bind(null, index, profile.username, profile.avatar), false);
    }

    function confirmAddToBlacklist(index, username, avatar) {
        let fnReady = function() {
            addToBlacklist(bots[index].SteamID, username, avatar);
            document.querySelector(`#asfstmbot_${index}`).remove();
        };
        let strTitle = 'Warning';
        let elWarning = `Do you want to add <strong>${username}</strong> to blacklist?`;
        let strButton = 'Add to blacklist';
        unsafeWindow.ShowConfirmDialog( strTitle, elWarning, strButton ).done( fnReady );
    }

    function addToBlacklist(steamID, username, avatar) {
        if ( (! blacklist.length) || (! blacklist.find(entry => entry.steamID == steamID)) ) {
            blacklist.push({"steamID":steamID, "username":username, "avatar":avatar});
            updateBlacklist();
        }
    }

    async function getBlacklist() {
        let promiseBlacklist = [];
        try {
            promiseBlacklist = await GM.getValue(BLACKLIST_NAME, '[]');
        } catch(e) {
            console.log('Failed to get blacklist: ' + e);
        }
        blacklist = JSON.parse(promiseBlacklist);
    }

    async function showBlacklist() {
        let modalLoadingHTML = '<div class="group_invite_throbber"><img src="https://community.akamai.steamstatic.com/public/images/login/throbber.gif"></div>';
        let blacklistModal = unsafeWindow.ShowAlertDialog('Blacklist', modalLoadingHTML, 'Close');
        let buttons = blacklistModal.GetContent().find('.newmodal_buttons').detach();

        await getBlacklist();

        let blacklistedAccounts = '';

        let colsView = '';
        if (blacklist.length > 10) {
            colsView = 'cols';
        }

        if (blacklist.length) {
            for (let account of blacklist) {
                let accountHTML = `
                  <div class="friendBlock persona offline" id="blacklist_${account.steamID}">
                    <a href="https://steamcommunity.com/profiles/${account.steamID}/" target="_blank" rel="noopener">
                      <div class="playerAvatar offline">
                        <img src="${account.avatar}">
                      </div>
                    </a>
                    <div class="friendBlockContent">
                      ${account.username}<br>
                      <span class="friendSmallText">
                        ${account.steamID}
                      </span>
                      <div class="btn_green_white_innerfade btn_small_thin" id="remove_blacklist_${account.steamID}" steamid= title="Remve from blacklist" style="position: absolute;right: 3%;top: 25%;">
                        <span>❌</span>
                      </div>
                    </div>
                  </div>
                `;
                blacklistedAccounts += accountHTML;
            }
        } else {
            blacklistedAccounts = '<span>Blacklist is empty.</span>';
        }

        let blacklistElement = `
          <div class="player_list_ctn">
            <div class="player_list_results responsive_friendblocks ${colsView}">
              ${blacklistedAccounts}
              <div style="clear: left;"></div>
            </div>
          </div>
        `;

        let blacklistContent = blacklistModal.GetContent().find('.newmodal_content');
        blacklistContent.html(''); // erase the throbber
        blacklistContent.append(blacklistElement);
        blacklistContent.append(buttons);
        blacklistModal.AdjustSizing();

        if (blacklist.length) {
            for (let account of blacklist) { // there must be a better way, maybe
                document.querySelector(`#remove_blacklist_${account.steamID}`).addEventListener("click", removeFromBlacklist.bind(null, account.steamID), false);
            }
        }
    }

    function removeFromBlacklist(steamID) {
        let blacklistElement = document.querySelector(`#blacklist_${steamID}`);
        if (blacklistElement) {
            blacklistElement.remove();
        }
        let removeIndex = blacklist.findIndex(entry => entry.steamID == steamID);
        if (removeIndex >= 0) {
            blacklist.splice(removeIndex, 1);
            updateBlacklist();
        }
    }

    function updateBlacklist() {
        let blacklistString = JSON.stringify(blacklist);
        GM.setValue(BLACKLIST_NAME, blacklistString);
    }

    function sendPostRequest(index) {
        let htmlButton = document.querySelector(`#send_${index}`);
        htmlButton.children[0].innerText = "Sending Offer...";
        let htmlElem = document.querySelector(`#full_trade_${index}`);
        let link = htmlElem.href.split('?')[1].split('&');
        let partnerClassIDs = link[3].split('=')[1];
        let myClassIDs = link[4].split('=')[1];
        let myAssetData = getPostData(-1, myClassIDs);
        let partnerAssetData = getPostData(index, partnerClassIDs);
        if (myAssetData.length != partnerAssetData.length) { // check for same number of items
            htmlButton.children[0].innerText = "ERROR: Item Mismatch!";
        }
        let tradeOfferObject = {
            newversion: true,
            version: 1,
            me: {
                assets: myAssetData,
                currency: [],
                ready: true
            },
            them:{
                assets: partnerAssetData,
                currency: [],
                ready: false
            }
        };

        let token = bots[index].TradeToken;
        let steam3ID = link[0].split('=')[1];
        let steam64ID = bots[index].SteamID;

        let form = [
            `sessionid=${sessionid}&`,
            "serverid=1&",
            `partner=${steam64ID}&`,
            `tradeoffermessage=${encodeURIComponent(TRADE_MESSAGE)}&`,
            `json_tradeoffer=${encodeURIComponent(JSON.stringify(tradeOfferObject))}&`,
            "captcha=&",
            `trade_offer_create_params=${encodeURIComponent('{"')}trade_offer_access_token${encodeURIComponent('":"')}${token}${encodeURIComponent('"}')}`
        ];

        GM_xmlhttpRequest ({
            method:     "POST",
            url:        "https://steamcommunity.com/tradeoffer/new/send",
            data:       form.join(""),
            headers:    {
                'Cookie': `sessionid=${sessionid}; steamLoginSecure=${steamLoginSecure};`,
                'Referer': `https://steamcommunity.com/tradeoffer/new/?partner=${steam3ID}&token=${token}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            onload:     function (response) {
                let status = response.status;
                if (status === 200 && response.statusText === "OK") {
                    htmlButton.children[0].innerText = "Sent!";
                    return;
                }
                else if (status.toString()[0] === "4") {
                    console.log(form.join(""));
                    htmlButton.children[0].innerText = "CLIENT ERROR: Check console!";
                }
                else if (status.toString()[0] === "5") {
                    console.log(form.join(""));
                    htmlButton.children[0].innerText = "SERVER ERROR: Check console!";
                }
                console.log(response.status + " " + response.statusText);
            },
            onerror:    function(reponse) {
                htmlButton.children[0].innerText = "REQUEST ERROR: Check console!";
                console.log("error: ", reponse);
            }
        });
    }

    function getPostData(index, classIDsString) {
        let assetObject;
        if (index < 0) { // my inventory
            assetObject = myAssets;
        } else { // bot inventory
            assetObject = bots[index].assets;
        }
        let parsedClassIDs = classIDsString.split(";");
        let assetIDs = [];
        for (let obj of assetObject) {
            if (parsedClassIDs.find(id => id == obj.classid)) {
                parsedClassIDs[parsedClassIDs.findIndex(id => id == obj.classid)] = -1;
                assetIDs.push({
                    appid: obj.appid,
                    contextid: obj.contextid,
                    amount: 1,
                    assetid: obj.assetid
                });
            }
        }
        return assetIDs;
    }

    function inventoryCountParser(number) {
        let numToStr = number.toString();
        let len = numToStr.length;
        let retVal = {};
        retVal.number = numToStr; // full number
        retVal.color = '#7b7b7c'; // normal; < 50k
        if (number > 65000) {
            retVal.color = '#A34C25'; // danger; > 65k
        } else if (number > 30000) {
            retVal.color = '#B9A074'; // warning; > 30k
        }
        if (len > 3) { // 4 or more digits
            retVal.number = `${numToStr.substring(0, len - 3)}K`;
        }
        return retVal;
    }

    function fetchInventory(steamId, startAsset, callback) {
        let url = "https://steamcommunity.com/inventory/" + steamId + "/753/6?l=english&count=2000";
        if (startAsset > 0) {
            url = url + "&start_assetid=" + startAsset.toString();
        } else {
            assets.length = 0;
            descriptions.length = 0;
        }
        debugPrint(url);
        let xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "json";
        xhr.onload = function() {
            debugPrint("...");
            if (stop) {
                updateMessage("Interrupted by user");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
            let status = xhr.status;
            let lastAsset = startAsset;
            if (status === 200) {
                errors = 0;
                if (typeof(xhr.response) !== "undefined") {
                    if (typeof(xhr.response.descriptions) !== "undefined") {
                        assets = [...assets,...xhr.response.assets];
                        descriptions = [...descriptions,...xhr.response.descriptions];
                        if (typeof(xhr.response.last_assetid) == "undefined") { //end of inventory
                            debugPrint("total_inventory_count = " + xhr.response.total_inventory_count);
                            callback();
                            return;
                        } else {
                            lastAsset = xhr.response.last_assetid;
                        }
                    }
                }
            } else {
                errors++;
                debugPrint("HTTP Error=" + status);
            }
            if (status == 403) {
                assets.length = 0; //switch to next bot
                callback();
            } else if ((status < 400 || status >= 500 || status == 408) && (errors <= MAX_ERRORS)) {
                setTimeout((function(steamId, startAsset, callback) {
                    return function() {
                        fetchInventory(steamId, startAsset, callback);
                    };
                })(steamId, lastAsset, callback), INVENTORY_API_LIMITER+ERROR_LIMITER*errors);
            } else {
                updateMessage("Error getting inventory, ERROR " + status);
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
        };
        xhr.onerror = function() {
            if (stop) {
                updateMessage("Interrupted by user");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
            errors++;
            if (errors <= MAX_ERRORS) {
                setTimeout((function(steamId, startAsset, callback) {
                    return function() {
                        fetchInventory(steamId, startAsset, callback);
                    };
                })(steamId, startAsset, callback), INVENTORY_API_LIMITER+ERROR_LIMITER*errors);
            } else {
                debugPrint("error getting inventory");
                updateMessage("Error getting inventory");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
        };
        xhr.send();
    }

    function calcState(badge) { //state 0 - less than max sets; state 1 - we have max sets, even out the rest, state 2 - all even
        if (badge.cards[badge.maxCards - 1].count == badge.maxSets) {
            if (badge.cards[0].count == badge.lastSet) {
                return 2; //nothing to do
            } else {
                return 1; //max sets are here, but we can distribute cards further
            }
        } else {
            return 0; //less than max sets
        }
    }

    function compareCards(index, callback) {
        let itemsToSend = [];
        let itemsToReceive = [];
        botBadges.length = 0;
        botBadges = deepClone(myBadges);
        for (let i = 0; i < botBadges.length; i++) {
            botBadges[i].cards.length = 0;
        }
        populateExistingCards(botBadges, false);
        debugPrint("bot's cards");
        debugPrint(deepClone(botBadges));
        debugPrint("our cards");
        debugPrint(deepClone(myBadges));

        for (let i = 0; i < botBadges.length; i++) {
            let myBadge = deepClone(myBadges[i]);
            let theirBadge = deepClone(botBadges[i]);
            let myState = calcState(myBadge);
            debugPrint("state="+myState);
            debugPrint("myapp="+myBadge.appId+" botapp="+theirBadge.appId);
            while (myState < 2) {
                let foundMatch = false;
                for (let j = 0; j < theirBadge.maxCards; j++) { //index of card they give
                    if (theirBadge.cards[j].count > 0) {
                        //try to match
                        let myInd = myBadge.cards.findIndex(a => a.item == theirBadge.cards[j].item); //index of slot where we receive card
                        if (myInd == -1) {
                            debugPrint("we don't have it");
                            let empty = myBadge.cards.find(card => card.item == null);
                            if (empty != undefined) {
                                debugPrint("found a place!");
                                empty.item = theirBadge.cards[j].item;
                                empty.iconUrl = theirBadge.cards[j].iconUrl;
                                myInd = myBadge.cards.indexOf(empty);
                            } else {
                                debugPrint("Error! We found more cards than expected");
                                debugPrint(deepClone(myBadge.cards));
                                debugPrint(deepClone(theirBadge.cards));
                            }
                        }
                        if ((myState == 0 && myBadge.cards[myInd].count < myBadge.maxSets) ||
                            (myState == 1 && myBadge.cards[myInd].count < myBadge.lastSet)) { //we need this ^Kfor the Emperor
                            debugPrint("we need this: " + theirBadge.cards[j].item + " (" + theirBadge.cards[j].count + ")");
                            //find a card to match.
                            for (let k = 0; k < myInd; k++) { //index of card we give
                                debugPrint("i=" + i + " j=" + j + " k=" + k + " myState=" + myState);
                                debugPrint("we have this: " + myBadge.cards[k].item + " (" + myBadge.cards[k].count + ")");
                                if ((myState == 0 && myBadge.cards[k].count > myBadge.maxSets) ||
                                    (myState == 1 && myBadge.cards[k].count > myBadge.lastSet)) { //that's fine for us
                                    debugPrint("it's a good trade for us");
                                    let theirInd = theirBadge.cards.findIndex(a => a.item == myBadge.cards[k].item); //index of slot where they will receive card
                                    if (theirInd == -1) { //they don't even know this card
                                        theirInd = theirBadge.cards.findIndex(a => a.item == null); //index of empty space
                                        //it's safe to assign item name to this card, they don't have it
                                        theirBadge.cards[theirInd].item = myBadge.cards[k].item;
                                    }
                                    if (bots[index].MatchEverything == false) { //make sure it's neutral+ for them
                                        if (theirBadge.cards[theirInd].count >= theirBadge.cards[j].count) {
                                            debugPrint("Not fair for them");
                                            debugPrint("they have this: " + theirBadge.cards[theirInd].item + " (" + theirBadge.cards[theirInd].count + ")");
                                            continue; //it's not neutral+, check other options
                                        }
                                    }
                                    debugPrint("it's a match!");
                                    let itemToSend = {
                                        "item": myBadge.cards[k].item,
                                        "count": 1,
                                        "class": myBadge.cards[k].class,
                                        "iconUrl": myBadge.cards[k].iconUrl
                                    };
                                    let itemToReceive = {
                                        "item": theirBadge.cards[j].item,
                                        "count": 1,
                                        "class": theirBadge.cards[j].class,
                                        "iconUrl": theirBadge.cards[j].iconUrl
                                    };
                                    //fill items to send
                                    let sendmatch = itemsToSend.find(item => item.appId == myBadges[i].appId);
                                    if (sendmatch == undefined) {
                                        let newMatch = {
                                            "appId": myBadges[i].appId,
                                            "title": myBadge.title,
                                            "cards": [itemToSend]
                                        };
                                        itemsToSend.push(newMatch);
                                    } else {
                                        let existingCard = sendmatch.cards.find(a => a.item == itemToSend.item);
                                        if (existingCard == undefined) {
                                            sendmatch.cards.push(itemToSend);
                                        } else {
                                            existingCard.count += 1;
                                        }
                                    }
                                    //add this item to their inventory
                                    theirBadge.cards[theirInd].count += 1;
                                    //remove this item from our inventory
                                    myBadge.cards[k].count -= 1;

                                    //fill items to receive
                                    let receiveMatch = itemsToReceive.find(item => item.appId == myBadges[i].appId);
                                    if (receiveMatch == undefined) {
                                        let newMatch = {
                                            "appId": myBadges[i].appId,
                                            "title": myBadge.title,
                                            "cards": [itemToReceive]
                                        };
                                        itemsToReceive.push(newMatch);
                                    } else {
                                        let existingCard = sendmatch.cards.find(a => a.item == itemToReceive.item);
                                        if (existingCard == undefined) {
                                            receiveMatch.cards.push(itemToReceive);
                                        } else {
                                            existingCard.count += 1;
                                        }
                                    }
                                    //add this item to our inventory
                                    myBadge.cards[myInd].count += 1;
                                    //remove this item from their inventory
                                    theirBadge.cards[j].count -= 1;
                                    foundMatch = true;
                                    break; //found a match!
                                }
                            }
                        }
                    }
                }
                if (!foundMatch) {
                    break; //found no matches - move to next badge
                }
                myBadge.cards.sort((a, b) => b.count - a.count);
                theirBadge.cards.sort((a, b) => b.count - a.count);
                myState = calcState(myBadge);
            }
        }
        debugPrint("items to send");
        debugPrint(deepClone(itemsToSend));
        debugPrint("items to receive");
        debugPrint(deepClone(itemsToReceive));
        bots[index].itemsToSend = itemsToSend;
        bots[index].itemsToReceive = itemsToReceive;
        if (itemsToSend.length > 0) {
            getUsername(index, callback);
        } else {
            debugPrint("no matches");
            callback();
        }
    }

    function getUsername(index, callback) {
        let url = "https://steamcommunity.com/profiles/" + bots[index].SteamID + "?xml=1";
        let xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "text";
        xhr.onload = function() {
            let status = xhr.status;
            let profile = {};
            profile.username = bots[index].SteamID;
            profile.avatar = GM.info.script.icon;
            profile.onlineState = "offline";
            debugPrint("getting username");
            if (status === 200) {
                errors = 0;
                let re = /<steamID><!\[CDATA\[(.+)\]\]><\/steamID>/g;
                let result = re.exec(xhr.response);
                if (result) {
                    profile.username = result[1];
                }
                re = /<avatarIcon><!\[CDATA\[(.+)\]\]><\/avatarIcon>/g;
                result = re.exec(xhr.response);
                if (result) {
                    profile.avatar = result[1];
                }
                re = /<onlineState>(.+)<\/onlineState>/g;
                result = re.exec(xhr.response);
                if (result) {
                    profile.onlineState = result[1];
                }
                debugPrint(deepClone(profile));
                addMatchRow(index, profile);
                callback();
            } else {
                if (stop) {
                    updateMessage("Interrupted by user");
                    hideThrobber();
                    enableButton();
                    let stopButton = document.getElementById("asf_stm_stop");
                    stopButton.remove();
                    return;
                }
                errors++;
                if (errors <= MAX_ERRORS) {
                    setTimeout((function(index, callback) {
                        return function() {
                            getUsername(index, callback);
                        };
                    })(index, callback), REQUEST_LIMITER+ERROR_LIMITER*errors);
                } else {
                    debugPrint("error HTTP Status=" + status);
                    updateMessage("Error getting username data, ERROR=" + status);
                    hideThrobber();
                    enableButton();
                    let stopButton = document.getElementById("asf_stm_stop");
                    stopButton.remove();
                    return;
                }
            }
        };
        xhr.onerror = function() {
            if (stop) {
                updateMessage("Interrupted by user");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
            errors++;
            if (errors <= MAX_ERRORS) {
                setTimeout((function(index, callback) {
                    return function() {
                        getUsername(index, callback);
                    };
                })(index, callback), REQUEST_LIMITER+ERROR_LIMITER*errors);
            } else {
                debugPrint("error");
                updateMessage("Error getting username data");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
        };
        xhr.send();
    }

    function checkUser(index) {
        debugPrint(index);
        updateMessage("Fetching bot " + (index + 1).toString() + " of " + bots.length.toString());
        updateProgress(index);
        if (blacklist.length) {
            if (blacklist.find(bot => bot.steamID == bots[index].SteamID)) {
                debugPrint("Bot blacklisted. Skipping...");
                return checkUser(index + 1);
            }
        }
        fetchInventory(bots[index].SteamID, 0, function() {
            debugPrint(bots[index].SteamID);
            debugPrint(assets.length);
            bots[index].assets = assets;
            compareCards(index, function() {
                if (index < bots.length - 1) {
                    setTimeout((function(index) {
                        return function() {
                            checkUser(index);
                        };
                    })(index + 1), REQUEST_LIMITER);
                } else {
                    debugPrint("finished");
                    debugPrint(new Date(Date.now()));
                    hideThrobber();
                    hideMessage();
                    updateProgress(bots.length - 1);
                    enableButton();
                    let stopButton = document.getElementById("asf_stm_stop");
                    stopButton.remove();
                }
            });
        });
    }

    function populateExistingCards(badges, filter) {
        debugTime("PopulateExistingCards1");
        debugPrint(deepClone(assets));
        debugPrint(deepClone(descriptions));
        descriptions = descriptions.filter(desc => badges.find(item => item.appId == desc.market_hash_name.split("-")[0]) != undefined);
        assets = assets.filter(asset => descriptions.find(item => item.classid == asset.classid) != undefined);
        for (let i = 0; i < assets.length; i++) {
            debugPrint(".");
            let descr = descriptions.find(desc => desc.classid == assets[i].classid); // eslint-disable-line
            if (descr != undefined) {
                let appId = descr.market_hash_name.split("-")[0];
                let title = appId;
                let gameTag = descr.tags.find(tag => tag.category == "Game");
                if (gameTag != undefined) {
                    title = gameTag.localized_tag_name;
                }
                let itemClassTag = descr.tags.find(tag => tag.category == "item_class");
                if (itemClassTag != undefined) {
                    if (itemClassTag.internal_name == "item_class_2") {
                        let cardBorderTag = descr.tags.find(tag => tag.category == "cardborder");
                        if (cardBorderTag != undefined) {
                            if (cardBorderTag.internal_name == "cardborder_0") {
                                let badge = badges.find(badge => badge.appId == appId);
                                if (badge != undefined) {
                                    let card = badge.cards.find(card => card.item == descr.market_hash_name);
                                    if (card == undefined) {
                                        let newcard = {
                                            "item": descr.market_hash_name,
                                            "count": 1,
                                            "class": assets[i].classid,
                                            "iconUrl": descr.icon_url
                                        };
                                        badge.cards.push(newcard);
                                        badge.title = title;
                                    } else {
                                        card.count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        debugTimeEnd("PopulateExistingCards1");
        debugTime("PopulateExistingCards2");
        for (let i = badges.length - 1; i >= 0; i--) {
            for (let j = badges[i].cards.length; j < badges[i].maxCards; j++) {
                badges[i].cards.push({
                    "item": null,
                    "count": 0,
                    "class": 0,
                    "iconUrl": null
                }); //fill missing cards with dummy element
            }
            badges[i].cards.sort((a, b) => b.count - a.count);
            if (filter) {
                if (badges[i].cards[0].count - badges[i].cards[badges[i].cards.length - 1].count < 2) {
                    //nothing to match, remove from list.
                    badges.splice(i, 1);
                    continue;
                }
            }
            let totalCards = 0;
            for (let j = 0; j < badges[i].maxCards; j++) {
                totalCards += badges[i].cards[j].count;
            }
            badges[i].maxSets = Math.floor(totalCards / badges[i].maxCards);
            badges[i].lastSet = Math.ceil(totalCards / badges[i].maxCards);
        }
        debugTimeEnd("PopulateExistingCards2");
    }

    async function getMaxCards() {
        let promiseMaxCards = [];
        try {
            promiseMaxCards = await GM.getValue(MAX_CARDS_NAME, '[]');
        } catch(e) {
            console.log('Failed to get max cards: ' + e);
        }
        storageMaxCards = JSON.parse(promiseMaxCards);
    }

    function updateMaxCards() {
        let maxCardsString = JSON.stringify(storageMaxCards);
        GM.setValue(MAX_CARDS_NAME, maxCardsString);
    }

    function populateMaxCards(index) {
        while (index < myBadges.length) {
            const currentAppId = myBadges[index].appId;
            const maxCardsFilterResult = storageMaxCards.filter(x => x.appId == currentAppId);
            if (maxCardsFilterResult.length == 1) {
                myBadges[index].maxCards = maxCardsFilterResult[0].maxCards;
            }
            if (myBadges[index].maxCards === 0) {
                let url = urlPath + "gamecards/" + myBadges[index].appId + "?l=english";
                let xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.responseType = "document";
                xhr.onload = function() { // eslint-disable-line
                    if (stop) {
                        updateMessage("Interrupted by user");
                        hideThrobber();
                        enableButton();
                        let stopButton = document.getElementById("asf_stm_stop");
                        stopButton.remove();
                        return;
                    }
                    let status = xhr.status;
                    if (status === 200) {
                        errors = 0;
                        debugPrint("processing badge " + myBadges[index].appId);
                        updateMessage("Getting badge data for " + myBadges[index].appId);
                        let maxCards = xhr.response.documentElement.getElementsByClassName("gamecard").length;
                        myBadges[index].maxCards = maxCards;
                        index++;
                    } else {
                        errors++;
                    }
                    if ((status < 400 || status >= 500) && (errors <= MAX_ERRORS)) {
                        setTimeout((function(index) {
                            return function() {
                                populateMaxCards(index);
                            };
                        })(index), REQUEST_LIMITER+ERROR_LIMITER*errors);
                    } else {
                        updateMessage("Error getting badge data, ERROR " + status);
                        hideThrobber();
                        enableButton();
                        let stopButton = document.getElementById("asf_stm_stop");
                        stopButton.remove();
                        return;
                    }

                };
                xhr.onerror = function() { // eslint-disable-line
                    if (stop) {
                        updateMessage("Interrupted by user");
                        hideThrobber();
                        enableButton();
                        let stopButton = document.getElementById("asf_stm_stop");
                        stopButton.remove();
                        return;
                    }
                    errors++;
                    if (errors <= MAX_ERRORS) {
                        setTimeout((function(index) {
                            return function() {
                                populateMaxCards(index);
                            };
                        })(index), REQUEST_LIMITER+ERROR_LIMITER*errors);
                        return;
                    } else {
                        debugPrint("error");
                        updateMessage("Error getting badge data");
                        hideThrobber();
                        enableButton();
                        let stopButton = document.getElementById("asf_stm_stop");
                        stopButton.remove();
                        return;
                    }
                };
                xhr.send();
                return; //do this synchronously to avoid rate limit
            } else {
                index++;
            }
        }
        debugPrint("populated");
        debugPrint("saving data to storage");
        let myBadgesReduce = [];
        // Filter 0 maxCards badges and extract appId and maxCards data
        myBadges.filter(x => x.maxCards != 0).reduce((_,x) => {myBadgesReduce.push({appId:x.appId, maxCards:x.maxCards})});
        for(let badgeMaxCards of myBadgesReduce) {
            const storageIndex = storageMaxCards.findIndex(x => x.appId == badgeMaxCards.appId);
            if (storageIndex >= 0) {
                storageMaxCards[storageIndex].maxCards = badgeMaxCards.maxCards;
            } else {
                storageMaxCards.push(badgeMaxCards);
            }
        }
        updateMaxCards();
        debugPrint("maxCards saved");
        updateMessage("Fetching own inventory");
        //g_steamID is a global steam variable
        let re = /g_steamID = "(.*)";/g;
        let g_steamID = re.exec(document.documentElement.textContent)[1];
        fetchInventory(g_steamID, 0, function() {
            debugPrint("fetched");
            debugPrint(deepClone(assets));
            debugPrint(deepClone(descriptions));
            debugPrint("our cards");
            debugPrint(deepClone(myBadges));
            myAssets = assets;
            populateExistingCards(myBadges, true);
            if (myBadges.length === 0) {
                hideThrobber();
                updateMessage("No cards to match");
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
            checkUser(0);
        });
    }

    function getBadges(page) {
        let url = urlPath + "badges?p=" + page + "&l=english";
        let xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "document";
        xhr.onload = function() {
            if (stop) {
                updateMessage("Interrupted by user");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
            let status = xhr.status;
            if (status === 200) {
                errors = 0;
                debugPrint("processing page " + page);
                updateMessage("Processing badges page " + page);
                if (page === 1) {
                    let pageLinks = xhr.response.documentElement.getElementsByClassName("pagelink");
                    if (pageLinks.length > 0) {
                        maxPages = Number(pageLinks[pageLinks.length - 1].textContent.trim());
                    }
                }
                let badges = xhr.response.documentElement.getElementsByClassName("badge_row_inner");
                for (let i = 0; i < badges.length; i++) {
                    if (badges[i].getElementsByClassName("owned").length > 0) { //we only need badges where we have at least one card, and no special badges
                        let appidNodes = badges[i].getElementsByClassName("card_drop_info_dialog");
                        if (appidNodes.length > 0) {
                            let appidText = appidNodes[0].getAttribute("id");
                            let appidSplitted = appidText.split("_");
                            if (appidSplitted.length >= 5) {
                                let appId = Number(appidSplitted[4]);
                                let maxCards = 0;
                                if (badges[i].getElementsByClassName("badge_craft_button").length === 0) {
                                    let maxCardsText = badges[i].getElementsByClassName("badge_progress_info")[0].innerText.trim();
                                    let maxCardsSplitted = maxCardsText.split(" ");
                                    maxCards = Number(maxCardsSplitted[2]);
                                }
                                let badgeStub = {
                                    "appId": appId,
                                    "title": null,
                                    "maxCards": maxCards,
                                    "maxSets": 0,
                                    "lastSet": 0,
                                    "cards": []
                                };
                                myBadges.push(badgeStub);
                            }
                        }
                    }
                }
                page++;
            } else {
                errors++;
            }
            if ((status < 400 || status >= 500) && (errors <= MAX_ERRORS)) {
                if (page <= maxPages) {
                    setTimeout((function(page) {
                        return function() {
                            getBadges(page);
                        };
                    })(page), REQUEST_LIMITER+ERROR_LIMITER*errors);
                } else {
                    debugPrint("all badge pages processed");
                    if (myBadges.length === 0) {
                        hideThrobber();
                        updateMessage("No cards to match");
                        enableButton();
                        let stopButton = document.getElementById("asf_stm_stop");
                        stopButton.remove();
                        return;
                    } else {
                        populateMaxCards(0);
                    }
                }
            } else {
                updateMessage("Error getting badge data, ERROR " + status);
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
        };
        xhr.onerror = function() {
            if (stop) {
                updateMessage("Interrupted by user");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
            errors++;
            if (errors <= MAX_ERRORS) {
                setTimeout((function(page) {
                    return function() {
                        getBadges(page);
                    };
                })(page), REQUEST_LIMITER+ERROR_LIMITER*errors);
            } else {
                debugPrint("error getting badge page");
                updateMessage("Error getting badge page");
                hideThrobber();
                enableButton();
                let stopButton = document.getElementById("asf_stm_stop");
                stopButton.remove();
                return;
            }
        };
        xhr.send();
    }

    function filterEventHandler(event) {
        let appId = event.target.id.split("_")[1];
        let matches = document.getElementsByClassName("asf_stm_appid_" + appId);
        for (let i = 0; i < matches.length; i++) {
            matches[i].style.display = event.target.checked ? "inline-block" : "none";
            checkRow(matches[i].parentElement.parentElement);
        }
    }

    function filterSwitchesHandler(event) {
        let action = event.target.id.split("_")[3];
        let filterWidget = document.getElementById("asf_stm_filters_body");
        let checkboxes = filterWidget.getElementsByTagName("input");
        for (let i = 0; i < checkboxes.length; i++) {
            if (action==="all") {
                if (!checkboxes[i].checked) {
                    checkboxes[i].checked=true;
                    filterEventHandler({"target":checkboxes[i]});
                }
            } else if (action==="none") {
                if (checkboxes[i].checked) {
                    checkboxes[i].checked=false;
                    filterEventHandler({"target":checkboxes[i]});
                }
            } else if (action==="invert") {
                checkboxes[i].checked=!checkboxes[i].checked;
                filterEventHandler({"target":checkboxes[i]});
            }
        }
    }

    function filtersButtonEvent() {
        let filterWidget = document.getElementById("asf_stm_filters");
        if (filterWidget.style.marginRight == "-50%") {
            filterWidget.style.marginRight = "unset";
        } else {
            filterWidget.style.marginRight = "-50%";
        }
    }

    function stopButtonEvent() {
        let stopButton = document.getElementById("asf_stm_stop");
        stopButton.removeEventListener("click", stopButtonEvent, false);
        stopButton.title = "Stopping...";
        stopButton.classList.add("btn_disabled");
        updateMessage("Stopping...");
        stop = true;
    }

    function buttonPressedEvent() {
        disableButton();
        debugPrint(new Date(Date.now()));
        let mainContentDiv = document.getElementsByClassName("maincontent")[0];
        mainContentDiv.textContent = "";
        mainContentDiv.style.width = "90%";
        mainContentDiv.innerHTML = `
          <div class="profile_badges_header">
            <div id="throbber">
              <div class="LoadingWrapper">
                <div class="LoadingThrobber">
                  <div class="Bar Bar1"></div>
                  <div class="Bar Bar2"></div>
                  <div class="Bar Bar3"></div>
                </div>
              </div>
            </div>
            <div>
            <div id="asf_stm_messagebox" class="profile_badges_header">
              <div id="asf_stm_message" class="profile_badges_header_title" style="text-align: center;">Initialization</div>
            </div>
            </div>
            <div style="width: 100%;">
              <div id="asf_stm_stop" class="btn_darkred_white_innerfade btn_medium_thin" style="float: right;margin-top: -12px;margin-left: 10px;" title="Stop scan">
                <span>🛑</span>
              </div>
              <div style="width: auto;overflow: hidden;" class="profile_xp_block_remaining_bar">
                <div id="asf_stm_progress" class="profile_xp_block_remaining_bar_progress" style="width: 100%;">
                </div>
              </div>
            </div>
          </div>
          <div id="asf_stm_filters" style="position:fixed;z-index:1000;right:5px;bottom:45px;margin-right:-50%;padding:0.3em;border:1px solid #054e79;
          border-radius:5px;background:${FILTER_BACKGROUND_COLOR};color:#67c1f5;width:40%;transition-duration:500ms;transition-timing-function:ease;">
            <div style="white-space:nowrap;width:100%";float:left;>Select:
              <a id="asf_stm_filter_all" class="commentthread_pagelinks">
                All
              </a>
              —
              <a id="asf_stm_filter_none" class="commentthread_pagelinks">
                None
              </a>
              —
              <a id="asf_stm_filter_invert" class="commentthread_pagelinks">
                Invert
              </a>
            </div>
            <hr />
            <div id="asf_stm_filters_body" style="display:flex;flex-wrap:wrap;">
              <span id="asf_stm_placeholder">No matches to filter</span>
            </div>
          </div>
          <div style="position: fixed;z-index: 1000;right: 5px;bottom: 5px;" id="asf_stm_filters_button_div">
            <a id="asf_stm_filters_button" class="btnv6_blue_hoverfade btn_medium">
              <span>Filters</span>
            </a>
          </div>
        `;
        document.getElementById("asf_stm_stop").addEventListener("click", stopButtonEvent, false);
        document.getElementById("asf_stm_filters_body").addEventListener("change", filterEventHandler);
        document.getElementById("asf_stm_filter_all").addEventListener("click", filterSwitchesHandler);
        document.getElementById("asf_stm_filter_none").addEventListener("click", filterSwitchesHandler);
        document.getElementById("asf_stm_filter_invert").addEventListener("click", filterSwitchesHandler);
        document.getElementById("asf_stm_filters_button").addEventListener("click", filtersButtonEvent, false);
        maxPages = 1;
        stop = false;
        myBadges.length = 0;
        updateMessage("Getting blacklist...");
        getBlacklist();
        getMaxCards();
        getBadges(1);
    }

    function addJS_Node (text, s_URL, funcToRun) {
        let D = document;
        let scriptNode = D.createElement ('script');
        scriptNode.type = "text/javascript";
        if (text) scriptNode.textContent = text;
        if (s_URL) scriptNode.src = s_URL;
        if (funcToRun) scriptNode.textContent = funcToRun.toString();
        let target = D.getElementsByTagName ('head')[0] || D.body || D.documentElement;
        target.appendChild (scriptNode);
    }

    function filterAppId (id, json) {
        if (json) {
            try {
                let replaced = id.replace(/#/g, '"');
                let parsed = JSON.parse(replaced);
                parsed.forEach(x => {
                    let elem = document.getElementById(x);
                    if (elem.checked) {
                        elem.click();
                    }
                });
            } catch (e) {
                console.error("Error: parsing failed: " + e);
            }
        } else {
            let elem = document.getElementById(id);
            if (elem) {
                elem.click();
            }
        }
    }

    if (!urlPath) {
        urlPath = document.URL.split("badges")[0];
    }

    if (document.getElementsByClassName("badge_details_set_favorite").length != 0) {
        let requestUrl = "https://asf.justarchi.net/Api/Listing/Bots";
        let requestFunc;
        if (typeof (GM_xmlhttpRequest) !== "function") {
            requestFunc = GM.xmlHttpRequest.bind(GM);
        } else {
            requestFunc = GM_xmlhttpRequest;
        }
        requestFunc({
            method: "GET",
            url: requestUrl,
            onload: function(response) {
                if (response.status != 200) {
                    console.error("Mooom, Archi broke the bot listing again!");
                    debugPrint("can't fetch list of bots, ERROR="+response.status);
                    debugPrint(response);
                    return;
                }
                let re = /("SteamID":)(\d+)/g;
                let fixedJson = response.response.replace(re, "$1\"$2\""); //because fuck js
                let parsedJson = JSON.parse(fixedJson);
                bots = parsedJson.Result;
                //bots.filter(bot=>bot.matchable_cards===1||bot.matchable_foil_cards===1);  //I don't think this is really needed
                bots.sort(function(a, b) { //sort received array as I like it. TODO: sort according to settings
                    let result = b.MatchEverything - a.MatchEverything; //bots with MatchEverything go first
                    if (result === 0) {
                        result = b.TotalItemsCount - a.TotalItemsCount; //then by TotalItemsCount descending
                    }
                    if (result === 0) {
                        result = b.TotalGamesCount - a.TotalGamesCount; //then by TotalGamesCount descending
                    }
                    return result;
                });
                if (FAST_SCAN) {
                    bots = bots.filter(x => x.TotalItemsCount > 10000 && x.TotalGamesCount > 500); // ~20% of bots
                }
                debugPrint("found total " + bots.length + " bots");
                let anchor = document.getElementsByClassName("profile_small_header_texture")[0];
                anchor.innerHTML += `
                  <div class="profile_small_header_additional" style="margin-top: 40px;">
                    <div class="btnv6_blue_hoverfade btn_medium" id="asf_stm_button">
                      <span>Scan ASF STM</span>
                    </div>
                    <div class="btnv6_blue_hoverfade btn_medium" id="view_blacklist" style="background:#c31b1b;margin-left:5px">
                      <span style="background:#375064">View Blacklist</span>
                    </div>
                  </div>
                `;
                document.querySelector(`#view_blacklist`).addEventListener("click", showBlacklist.bind(null), false);
                enableButton();
                addJS_Node(null, null, filterAppId);
            },
            onerror: function(response) {
                debugPrint("can't fetch list of bots");
                debugPrint(response);
            },
            onabort: function(response) {
                debugPrint("can't fetch list of bots - aborted");
                debugPrint(response);
            },
            ontimeout: function(response) {
                debugPrint("can't fetch list of bots - timeout");
                debugPrint(response);
            }
        });
    }

    if (sessionid === "" || steamLoginSecure === "") {
        let cookiesString = document.cookie.split(';');
        let cookiesParsed = {};
        cookiesString.forEach(elem => {
            cookiesParsed[elem.split('=')[0].trim()] = elem.split('=')[1];
        });
        sessionid = cookiesParsed.sessionid;
        steamLoginSecure = cookiesParsed.steamLoginSecure;
    }
})();
