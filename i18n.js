// i18n — CyberCity dictionaries (fleet convention, see Password/i18n.js).
// English source strings ARE the keys, so a missing entry falls back to
// English. Locale comes from carino-lang.js (window.CarinoLang.current);
// this script is deferred and loaded after it, and re-applies on the fleet
// 'carino:langchange' event. Only the DOM chrome is translated: the stencil
// hint drawn into the city (src/elements/hud.js) stays English, because its
// glyph set has no other script; the help overlay is its translated twin.

const I18N = {
    es: {
        'Late shift.': 'Turno nocturno.',
        'Good morning.': 'Buenos días.',
        'Good afternoon.': 'Buenas tardes.',
        'Good evening.': 'Buenas noches.',
        'More': 'Más',
        'click for fullscreen': 'clic para pantalla completa',
        'tap for fullscreen': 'toca para pantalla completa',
        'Help': 'Ayuda',
        'Pause': 'Pausa',
        'Resume': 'Reanudar',
        'Close': 'Cerrar',
        'Fullscreen': 'Pantalla completa',
        'How to play': 'Cómo se juega',
        'Four worlds drawn in text characters. Leave it alone and it walks itself; take the camera whenever you like. Opening this pauses the city.': 'Cuatro mundos dibujados con caracteres de texto. Si lo dejas, camina solo; toma la cámara cuando quieras. Abrir esta ayuda pausa la ciudad.',
        'Walk': 'Caminar',
        'Look (or drag)': 'Mirar (o arrastrar)',
        'Run, crouch': 'Correr, agacharse',
        'Change world': 'Cambiar de mundo',
        'Change the weather': 'Cambiar el clima',
        'Time of day, stop the clock': 'Hora del día, detener el reloj',
        'New city': 'Ciudad nueva',
        'Take or give back the camera': 'Tomar o devolver la cámara',
        'Touch': 'Táctil',
        'Left half of the screen walks, right half looks. Tap the city for fullscreen.': 'La mitad izquierda de la pantalla camina y la derecha mira. Toca la ciudad para pantalla completa.',
        'No sound. Nothing is sent anywhere.': 'Sin sonido. No se envía nada a ningún sitio.',
    },
    'pt-BR': {
        'Late shift.': 'Turno da noite.',
        'Good morning.': 'Bom dia.',
        'Good afternoon.': 'Boa tarde.',
        'Good evening.': 'Boa noite.',
        'More': 'Mais',
        'click for fullscreen': 'clique para tela cheia',
        'tap for fullscreen': 'toque para tela cheia',
        'Help': 'Ajuda',
        'Pause': 'Pausar',
        'Resume': 'Retomar',
        'Close': 'Fechar',
        'Fullscreen': 'Tela cheia',
        'How to play': 'Como jogar',
        'Four worlds drawn in text characters. Leave it alone and it walks itself; take the camera whenever you like. Opening this pauses the city.': 'Quatro mundos desenhados com caracteres de texto. Deixe quieto e ele anda sozinho; assuma a câmera quando quiser. Abrir esta ajuda pausa a cidade.',
        'Walk': 'Andar',
        'Look (or drag)': 'Olhar (ou arrastar)',
        'Run, crouch': 'Correr, agachar',
        'Change world': 'Trocar de mundo',
        'Change the weather': 'Mudar o tempo',
        'Time of day, stop the clock': 'Hora do dia, parar o relógio',
        'New city': 'Nova cidade',
        'Take or give back the camera': 'Assumir ou devolver a câmera',
        'Touch': 'Toque',
        'Left half of the screen walks, right half looks. Tap the city for fullscreen.': 'A metade esquerda da tela anda e a direita olha. Toque na cidade para tela cheia.',
        'No sound. Nothing is sent anywhere.': 'Sem som. Nada é enviado a lugar nenhum.',
    },
    ja: {
        'Late shift.': '夜勤お疲れさま。',
        'Good morning.': 'おはようございます。',
        'Good afternoon.': 'こんにちは。',
        'Good evening.': 'こんばんは。',
        'More': 'その他',
        'click for fullscreen': 'クリックで全画面',
        'tap for fullscreen': 'タップで全画面',
        'Help': 'ヘルプ',
        'Pause': '一時停止',
        'Resume': '再開',
        'Close': '閉じる',
        'Fullscreen': '全画面',
        'How to play': '遊び方',
        'Four worlds drawn in text characters. Leave it alone and it walks itself; take the camera whenever you like. Opening this pauses the city.': '文字で描かれた四つの世界。放っておけば自動で歩きます。いつでもカメラを操作できます。このヘルプを開くと街は一時停止します。',
        'Walk': '歩く',
        'Look (or drag)': '見回す（ドラッグでも可）',
        'Run, crouch': '走る、しゃがむ',
        'Change world': '世界を切り替え',
        'Change the weather': '天気を変える',
        'Time of day, stop the clock': '時間帯、時計を止める',
        'New city': '新しい街',
        'Take or give back the camera': 'カメラを操作／自動に戻す',
        'Touch': 'タッチ',
        'Left half of the screen walks, right half looks. Tap the city for fullscreen.': '画面の左半分で歩き、右半分で見回します。街をタップすると全画面になります。',
        'No sound. Nothing is sent anywhere.': '音はありません。どこにも何も送信しません。',
    },
    ru: {
        'Late shift.': 'Ночная смена.',
        'Good morning.': 'Доброе утро.',
        'Good afternoon.': 'Добрый день.',
        'Good evening.': 'Добрый вечер.',
        'More': 'Ещё',
        'click for fullscreen': 'щёлкните для полного экрана',
        'tap for fullscreen': 'коснитесь для полного экрана',
        'Help': 'Справка',
        'Pause': 'Пауза',
        'Resume': 'Продолжить',
        'Close': 'Закрыть',
        'Fullscreen': 'Полный экран',
        'How to play': 'Как играть',
        'Four worlds drawn in text characters. Leave it alone and it walks itself; take the camera whenever you like. Opening this pauses the city.': 'Четыре мира, нарисованных текстовыми символами. Если ничего не трогать, камера гуляет сама; управление можно взять в любой момент. Открытая справка ставит город на паузу.',
        'Walk': 'Идти',
        'Look (or drag)': 'Смотреть (или перетаскивать)',
        'Run, crouch': 'Бежать, присесть',
        'Change world': 'Сменить мир',
        'Change the weather': 'Сменить погоду',
        'Time of day, stop the clock': 'Время суток, остановить часы',
        'New city': 'Новый город',
        'Take or give back the camera': 'Взять или вернуть камеру',
        'Touch': 'Касание',
        'Left half of the screen walks, right half looks. Tap the city for fullscreen.': 'Левая половина экрана — ходьба, правая — обзор. Коснитесь города для полного экрана.',
        'No sound. Nothing is sent anywhere.': 'Без звука. Ничего никуда не отправляется.',
    },
};

function currentFleetLang() { return (window.CarinoLang && window.CarinoLang.current) || 'en'; }

function t(key) {
    const dict = I18N[currentFleetLang()];
    return (dict && dict[key]) || key;
}

// Static markup: elements carrying data-i18n use their original English text
// as the key (captured on first pass, so locale switches stay reversible).
function applyI18n() {
    document.documentElement.lang = currentFleetLang();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        if (!el.dataset.i18nKey) el.dataset.i18nKey = el.textContent.trim().replace(/\s+/g, ' ');
        el.textContent = t(el.dataset.i18nKey);
    });
}

document.addEventListener('DOMContentLoaded', applyI18n);
window.addEventListener('carino:langchange', applyI18n);
