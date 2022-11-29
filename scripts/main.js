const moduleID = 'rolls-in-chat';
let socket;


Hooks.once('init', () => {
    game.settings.register(moduleID, 'hideTokenImg', {
        name: 'Hide Token Img for Hidden Rolls',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register(moduleID, 'replacePreviousRolls', {
        name: 'Replace Previous Rolls',
        hint: 'If the same token rolls a second time with the same prompt, the previous roll result will be removed.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register(moduleID, 'chatPromptButton', {
        name: 'Enable Chat d20 Button',
        hint: 'If enabled, the d20 icon in the chat log can be clicked to open the prompt dialog. A keybind is also available to open the prompt dialog.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
        requiresReload: true
    });

    game.settings.register(moduleID, 'foldMessage', {
        name: 'Collapse Chat Messages After Saving Throws',
        hint: 'For item-based saving throws, collapse the item description after a roll is made.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });

    game.keybindings.register(moduleID, 'openPromptDialog', {
        name: 'Open Prompt Dialog',
        editable: [
            {
                key: 'KeyP'
            }
        ],
        onDown: () => createPromptDialog(),
        restricted: true
    });

    libWrapper.register(moduleID, 'CONFIG.Item.documentClass._onChatCardAction', async (wrapper, event) => {
        const button = event.currentTarget;
        const card = button.closest('.chat-card');
        if (!card) return;
        const messageId = card.closest('.message').dataset.messageId;
        const message = game.messages.get(messageId);
        const action = button.dataset.action;

        if (action !== 'save') return wrapper(event);

        button.disabled = true;
        const actor = canvas.tokens.get(message.speaker.token).actor || game.actors.get(card.dataset.actorId);
        const item = actor.items.get(card.dataset.itemId);
        const { ability, dc } = item.system.save;

        await rollInChat({ message, rollType: 'save', abilitySkill: ability, dc });

        button.disabled = false;
    });
});

Hooks.once('socketlib.ready', () => {
    socket = socketlib.registerModule(moduleID);

    socket.register('updateMessage', async (messageID, flagData) => {
        const message = game.messages.get(messageID);
        await message.setFlag(moduleID, 'rolls', flagData);
    });
});


Hooks.on('renderChatMessage', async (message, html, data) => {
    if (html.find(`.${moduleID}.card-buttons`).length) {
        html.css({ background: '#dce7f2', border: '2px solid #545469' });
        html.find(`header.message-header`).hide();
    }

    const flagData = message.flags[moduleID]?.rolls;
    if (!flagData) return;

    if (!game.user.isGM) {
        for (const roll of flagData) {
            if (!roll.hidden) continue;

            roll.formula = '???';
            roll.total = '?';
            roll.passFail = '';
            roll.tooltip = '';
            if (game.settings.get(moduleID, 'hideTokenImg')) {
                roll.img = `modules/${moduleID}/img/hidden-token.png`;
                roll.name = '???';
            }
        }
    }

    const snippet = await renderTemplate(`modules/${moduleID}/templates/${moduleID}.hbs`, { rolls: flagData });
    html.find(`div.card-buttons`).after(snippet);

    const cardContent = html.find(`div.card-content`);
    if (game.settings.get(moduleID, 'foldMessage') && cardContent.length) cardContent[0].style.display = 'none';

    if (game.modules.get('better-dice-tooltips')?.active) {
        const cb = Hooks.events.renderChatMessage.find(h => h.fn.name === 'betterDiceTooltips')?.fn;
        if (!cb) return;

        cb.call(null, message, html, data);
    }
});

Hooks.on('renderChatLog', (app, html, data) => {
    html.on('click', `.${moduleID} button`, async ev => {
        const $button = $(ev.currentTarget);
        const chatMessageID = $button.closest(`li.chat-message`).data().messageId;
        const promptMessage = game.messages.get(chatMessageID);
        const { rollType, abilitySkill } = $button.data();

        await rollInChat({ message: promptMessage, rollType, abilitySkill, event: ev });
    });

    html.on('click', `.ric img`, ev => {
        ev.stopPropagation();
        const r = ev.target.closest(`div.dice-roll`);
        if (r.classList.contains('hidden')) return;

        const $img = $(ev.currentTarget);
        const tokenId = $img.data().tokenId;
        const token = canvas.tokens.get(tokenId);
        if (token.isVisible) {
            token.control({ releaseOthers: true });
            return canvas.animatePan({ x: token.x, y: token.y });
        }
    });

    const getToken = ev => {
        const $img = $(ev.currentTarget);
        const tokenId = $img.data().tokenId;
        const token = canvas.tokens.get(tokenId);

        return token;
    };

    html.on('mouseenter', `.ric > img`, ev => {
        const r = ev.target.closest(`div.dice-roll`);
        if (r.classList.contains('hidden') && !game.user.isGM) return;

        const token = getToken(ev);
        if (token?.isVisible && !token._controlled) token._onHoverIn(ev);
    });

    html.on('mouseleave', `.ric > img`, ev => {
        const r = ev.target.closest(`div.dice-roll`);
        if (r.classList.contains('hidden') && !game.user.isGM) return;

        const token = getToken(ev);
        if (token?.isVisible) token._onHoverOut(ev);
    });

    if (game.user.isGM && game.settings.get(moduleID, 'chatPromptButton')) {
        const d20icon = html.find('label.chat-control-icon')[0];
        const d20button = document.createElement('a');
        d20button.classList.add('chat-control-icon');
        d20button.innerHTML = `<i class="fas fa-dice-d20"></i>`;
        d20button.onclick = ev => createPromptDialog(ev);
        d20icon.parentElement.replaceChild(d20button, d20icon);
    }


    const canApply = div => {
        if (!game.user.isGM) return false;

        const message = game.messages.get(div.closest(`li`).data().messageId);
        const flagData = message.getFlag(moduleID, 'rolls');
        if (!flagData) return false;

        const rollID = div.data().rollId;
        const targetRoll = flagData.find(r => r.id === rollID);
        return !!targetRoll.hidden;
    };

    const toggleHidden = div => {
        const message = game.messages.get(div.closest(`li`).data().messageId);
        const flagData = message.getFlag(moduleID, 'rolls');
        if (!flagData) return false;

        const rollID = div.data().rollId;
        const targetRollIdx = flagData.findIndex(r => r.id === rollID);
        flagData[targetRollIdx].hidden = flagData[targetRollIdx].hidden ? '' : 'hidden';
        message.setFlag(moduleID, 'rolls', flagData);
    }

    ContextMenu.create(app, html, '.ric', [
        {
            name: 'CHAT.RevealMessage',
            icon: `<i class='fas fa-eye'></i>`,
            condition: canApply,
            callback: toggleHidden
        },
        {
            name: 'CHAT.ConcealMessage',
            icon: `<i class='fas fa-eye-slash'></i>`,
            condition: div => {
                if (!game.user.isGM) return false;
                else return !canApply(div);
            },
            callback: toggleHidden
        },
        {
            name: 'SIDEBAR.Delete',
            icon: `<i class='fas fa-trash'></i>`,
            condition: () => game.user.isGM,
            callback: div => {
                const message = game.messages.get(div.closest(`li`).data().messageId);
                const flagData = message.getFlag(moduleID, 'rolls');
                if (!flagData) return false;

                const rollID = div.data().rollId;
                const targetRollIdx = flagData.findIndex(r => r.id === rollID);
                flagData.splice(targetRollIdx, 1);
                message.setFlag(moduleID, 'rolls', flagData);
            }

        }
    ], `${moduleID}`);

});


async function rollInChat({ message, rollType, abilitySkill, event = null, dc = null } = {}) {
    let actors = [];
    if (game.user.character) actors = [game.user.character];
    else actors = canvas.tokens.controlled.map(t => t.actor);
    if (!actors.length) return;

    let flagData = message.getFlag(moduleID, 'rolls') || [];
    const rolls = [];
    const dsnPromises = [];
    const rollOptions = {
        chatMessage: false,
        dialogOptions: { left: window.innerWidth - 710 }
    };
    if (event) rollOptions.dialogOptions.top = event.clientY - 50;
    for (const actor of actors) {
        const roll = {};

        let r;
        switch (rollType) {
            case 'save':
                r = await actor.rollAbilitySave(abilitySkill, rollOptions);
                break;
            case 'abilityTest':
                r = await actor.rollAbilityTest(abilitySkill, rollOptions);
                break;
            case 'skill':
                r = await actor.rollSkill(abilitySkill, rollOptions);
        }
        if (!r) continue;

        roll.id = foundry.utils.randomID();
        while (flagData.map(r => r.id).includes(roll.id)) roll.id = foundry.utils.randomID();
        roll.total = r.total;
        roll.formula = r.formula;
        const token = actor.token || actor.getActiveTokens()[0].document;
        roll.tokenID = token.id;
        roll.img = token.texture.src;
        roll.name = token.name;
        roll.tooltip = await r.getTooltip();
        if (dc) roll.passFail = r.total < dc ? 'fail' : 'pass';
        if (r.options.rollMode !== 'publicroll') roll.hidden = 'hidden';

        rolls.push(roll);

        if (game.dice3d) {
            const users = r.hidden ? game.users.filter(u => u.isGM).map(u => u.id) : null;
            const dsnPromise = game.dice3d.showForRoll(r, game.user, true, users);
            dsnPromises.push(dsnPromise);
        }
    }
    if (!rolls.length) return;

    if (dsnPromises.length) await Promise.all(dsnPromises);

    flagData.push(...rolls);

    if (game.settings.get(moduleID, 'replacePreviousRolls')) {
        const removeIdcs = new Set();
        for (const roll of rolls) {
            for (let i = 0; i < flagData.length; i++) {
                if (roll.tokenID === flagData[i].tokenID && roll.id !== flagData[i].id) removeIdcs.add(i);
            }
        }

        flagData = flagData.filter((roll, index) => !removeIdcs.has(index));
    }

    return socket.executeAsGM('updateMessage', message.id, flagData);
}

function createPromptDialog(event) {
    const dialogOptions = { width: 250 };
    if (event) {
        dialogOptions.top = event.target.offsetTop - 30;
        dialogOptions.left = window.innerWidth - 560;
    }
    new Dialog({
        title: 'Creat Roll in Chat Prompt',
        content: `
            <style>
                .dialog .dialog-buttons {
                    flex-direction: column;
                }
            </style>
        `,
        buttons: {
            skill: {
                label: 'Skill Check',
                callback: () => createSkillCheckDialog()
            },
            ability: {
                label: 'Ability Check',
                callback: () => createAbilityCheckDialog()
            },
            save: {
                label: 'Saving Throw',
                callback: () => createAbilityCheckDialog(true)
            }
        }
    }, dialogOptions).render(true);
}

function createSkillCheckDialog() {
    let skillOptions = ``;
    for (const [skl, skill] of Object.entries(game.system.config.skills)) {
        skillOptions += `<option value="${skl}">${skill.label}</option>`;
    }
    new Dialog({
        title: 'Select Skill',
        content: `
            <style>
                .dialog .dialog-buttons {
                    flex-direction: column;
                }

                select.ric-sklAbl-select {
                    width: 100%;
                    margin-bottom: 10px;
                }
            </style>

            <div>
                <select class="ric-sklAbl-select">
                    ${skillOptions}
                </select>
            </div>
        `,
        buttons: {
            confirm: {
                label: 'Confirm',
                callback: html => {
                    const selectedSkill = html[0].querySelector('select.ric-sklAbl-select').value;
                    createPromptMessage('skill', selectedSkill);
                }
            },
            cancel: {
                label: 'Cancel'
            }
        },
        default: "confirm"
    }, { width: 250 }).render(true);
}

function createAbilityCheckDialog(isSave = false) {
    const rollType = isSave ? 'save' : 'abilityTest';

    let ablOptions = ``;
    for (const [abl, ability] of Object.entries(game.system.config.abilities)) {
        ablOptions += `<option value="${abl}">${ability}</option>`;
    }

    new Dialog({
        title: `${isSave ? 'Saving Throw' : 'Ability Check'}: Select Ability`,
        content: `
            <style>
                .dialog .dialog-buttons {
                    flex-direction: column;
                }

                select.ric-sklAbl-select {
                    width: 100%;
                    margin-bottom: 10px;
                }
            </style>
            
            <div>
                <select class="ric-sklAbl-select">
                    ${ablOptions}
                </select>
            </div>
        `,
        buttons: {
            confirm: {
                label: 'Confirm',
                callback: html => {
                    const selectedAbility = html[0].querySelector('select.ric-sklAbl-select').value;
                    createPromptMessage(rollType, selectedAbility);
                }
            },
            cancel: {
                label: 'Cancel'
            }
        },
        default: "confirm"
    }, { width: 250 }).render(true);
}

function createPromptMessage(rollType, abilitySkill) {
    const content = `
        <div class='${moduleID} card-buttons' style='margin: 5px 0;'>
            <button data-roll-type='${rollType}' data-ability-skill='${abilitySkill}'>
                ${buttonLabel(rollType, abilitySkill)}
            </button>
        </div>
    `;
    ChatMessage.create({ content });

    function buttonLabel(rollType, abilitySkill) {
        let label = CONFIG.DND5E.abilities[abilitySkill] || CONFIG.DND5E.skills[abilitySkill]?.label;
        switch (rollType) {
            case 'save':
                label += ' Saving Throw';
                break;
            case 'abilityTest':
            case 'skill':
                label += ' Check';
        }

        return label;
    }
}
