import type { Note } from '../../types'

// 見た目の確認用の見本ノート（#/note/sample）。内容は架空だが、数字と答えは正しい。
// 7種類の図（tape / venn2 / line / flow / tree / table / slots）をすべて使っている。
// 型3のテープ図は、帯が狭くて文字が入らない区切り（注記に回る場合）の見本でもある。

export const SAMPLE_NOTE: Note = {
  topic: 'nv-ratio',
  summary:
    '「割合と比」では、全体を比で分ける問題、増えた割合を出す問題、食塩水の濃さを求める問題などが出ます。どの問題も、「何をもとにする量（100%）にするか」を決めると解けます。ここでは、式ではなく具体的な数字の例で、解き方を1つずつ見ていきます。',
  keyPoints: [
    'まず「もとにする量」がどれかを決める',
    '比は「全体を何等分するか」と考える',
    '% は 100 で割って小数にしてから計算する（25% → 0.25）',
  ],
  formulas: [
    { label: '割合の基本', body: '比べる量 = もとにする量 × 割合', example: '80人の 25% → 80 × 0.25 = 20人' },
    {
      label: '分数と割合',
      body: '25% = {{1/4}} = 0.25',
      example: '80人の {{1/4}} → 80 ÷ 4 = 20人（上の例と同じ答え）',
    },
    { label: '比の配分', body: '1つ分 = 全体 ÷ 比の数の合計', example: '5,400円を 4:5 に分ける → 5,400 ÷ 9 = 600円（1つ分）' },
    { label: '食塩水', body: '食塩の重さ = 食塩水の重さ × 濃度', example: '300g の 7% → 300 × 0.07 = 21g' },
  ],
  patterns: [
    {
      title: '比で分ける（配分）',
      lead: '全体を「4:5」のような比で分けて、それぞれの取り分を求める型です。',
      example: {
        stem: '5,400円を、A と B で 4:5 に分ける。\nA の取り分は何円か。',
        figure: {
          type: 'tape',
          rows: [
            {
              label: '5,400円を 4:5 に分ける',
              segments: [
                { text: 'A（4）', size: 4, tone: 'base' },
                { text: 'B（5）', size: 5, tone: 'ok' },
              ],
              total: '5,400円',
            },
          ],
        },
        steps: [
          { text: '比の数をたして、全体が「いくつ分」かを数えます。', calc: '4 + 5 = 9（9つ分）' },
          {
            text: '全体を 9等分して、1つ分の大きさを出します。',
            calc: '5,400 ÷ 9 = 600円',
            figure: {
              type: 'tape',
              rows: [
                {
                  label: '1つ分は 600円',
                  segments: [
                    { text: '600円 × 4', size: 4, tone: 'base' },
                    { text: '600円 × 5', size: 5, tone: 'ok' },
                  ],
                  total: '5,400円',
                },
              ],
            },
          },
          { text: 'A は 4つ分なので、1つ分の 4倍です。', calc: '600 × 4 = 2,400円' },
          {
            text: '確かめます。B は 5つ分です。A と B をたすと、全体の 5,400円に戻ります。',
            calc: '600 × 5 = 3,000円\n2,400 + 3,000 = 5,400円',
          },
        ],
        answer: '2,400円',
      },
      point: '比は「全体を何等分するか」を表します。まず 1つ分を出してから、かけ算をします。',
    },
    {
      title: '食塩水を混ぜる',
      lead: '濃さのちがう食塩水を混ぜて、できた食塩水の濃さを求める型です。',
      example: {
        stem: '7%の食塩水 300g と、6%の食塩水 200g を混ぜる。\nできた食塩水の濃度は何%か。',
        figure: {
          type: 'flow',
          items: [
            { title: '7%', lines: ['300g'] },
            '+',
            { title: '6%', lines: ['200g'] },
            '=',
            { title: '？%', lines: ['500g'], tone: 'ok' },
          ],
        },
        steps: [
          {
            text: '食塩の重さを、それぞれ出します。（食塩 = 食塩水 × 濃度）',
            calc: '300 × 0.07 = 21g\n200 × 0.06 = 12g',
            figure: {
              type: 'flow',
              items: [
                { title: '7%', lines: ['300g', '食塩 21g'] },
                '+',
                { title: '6%', lines: ['200g', '食塩 12g'] },
                '=',
                { title: '？%', lines: ['500g', '食塩 ？g'], tone: 'ok' },
              ],
            },
          },
          { text: '食塩を合計します。', calc: '21 + 12 = 33g' },
          { text: '食塩水の重さも合計します。', calc: '300 + 200 = 500g' },
          {
            text: '濃度は「食塩 ÷ 食塩水」です。小数を % に直します。',
            calc: '33 ÷ 500 = 0.066\n0.066 × 100 = 6.6%',
            figure: {
              type: 'flow',
              items: [{ title: '食塩 33g' }, '÷', { title: '食塩水 500g' }, '=', { title: '6.6%', tone: 'ok' }],
            },
          },
        ],
        answer: '6.6%',
      },
      point: '濃度（%）どうしをたして 2 で割ってはいけません。重さがちがうので、食塩の重さで考えます。',
    },
    {
      title: '増えた割合を求める',
      lead: '「昨年より何%増えたか」のように、増減の割合を聞かれる型です。',
      example: {
        stem: '売上は、昨年が 400万円、今年が 460万円だった。\n今年は昨年より何%増えたか。',
        table: {
          headers: ['年', '売上'],
          rows: [
            ['昨年', '400万円'],
            ['今年', '460万円'],
          ],
        },
        steps: [
          {
            text: 'まず、増えた金額を出します。',
            calc: '460 − 400 = 60万円',
            figure: {
              type: 'tape',
              rows: [
                { label: '昨年', segments: [{ text: '昨年 400万円', size: 10, tone: 'base' }] },
                {
                  label: '今年',
                  segments: [
                    { text: '昨年と同じ 400万円', size: 10, tone: 'base' },
                    { text: '増えた 60万円', size: 1.5, tone: 'ok' },
                  ],
                  total: '460万円',
                },
              ],
              caption: '帯の長さは金額の大きさに比例しています',
            },
          },
          {
            text: '「もとにする量」は、比べる相手の昨年（400万円）です。増えた金額を、昨年の金額で割ります。',
            calc: '60 ÷ 400 = 0.15',
            figure: {
              type: 'table',
              table: {
                headers: ['', '金額'],
                rows: [
                  ['増えた分（比べる量）', '60万円'],
                  ['昨年（もとにする量）', '400万円'],
                ],
              },
              highlight: [[1, 1]],
            },
          },
          { text: '小数を % に直すには、100倍します。', calc: '0.15 × 100 = 15%' },
        ],
        answer: '15%',
      },
      point: '「〜より」の「〜」が、もとにする量です。「昨年より」なら、昨年で割ります。',
    },
    {
      title: '2つの集合（ベン図）',
      lead: '2つのグループの人数から、「どちらか」「両方」を整理して割合を出す型です。',
      example: {
        stem: '40人に聞いた。朝食を食べる人は 22人、自炊する人は 18人、両方する人は 4人だった。\n朝食だけ食べる人は、全体の何%か。',
        figure: { type: 'venn2', labels: ['朝食', '自炊'], onlyA: '？', both: '4人', onlyB: '？', outside: '？', total: '40人' },
        steps: [
          {
            text: '朝食を食べる 22人には、両方する 4人も入っています。朝食だけの人は、4人をひきます。',
            calc: '22 − 4 = 18人',
            figure: { type: 'venn2', labels: ['朝食', '自炊'], onlyA: '18人', both: '4人', onlyB: '？', outside: '？', total: '40人' },
          },
          {
            text: '自炊だけの人と、どちらもしない人も出して、全体と合うか確かめます。',
            calc: '18 − 4 = 14人\n40 − (18 + 4 + 14) = 4人',
            figure: {
              type: 'venn2',
              labels: ['朝食', '自炊'],
              onlyA: '18人',
              both: '4人',
              onlyB: '14人',
              outside: '4人',
              total: '40人',
              caption: '18 + 4 + 14 + 4 = 40人',
            },
          },
          { text: '全体 40人のうち、朝食だけの 18人の割合です。', calc: '18 ÷ 40 = 0.45\n0.45 × 100 = 45%' },
        ],
        answer: '45%',
      },
      point: '重なっている部分（両方）は、1回だけ数えます。先にひいてから考えます。',
    },
    {
      title: '道のりを比で分ける',
      lead: '道のりを比で分けて、途中の地点までの距離を求める型です。',
      example: {
        stem: 'P から R までの道のりは 1,500m である。途中の Q は、PQ:QR = 2:3 になる地点である。\nPQ は何mか。',
        figure: {
          type: 'line',
          points: [
            { at: 0, label: 'P' },
            { at: 600, label: 'Q', sub: '？' },
            { at: 1500, label: 'R' },
          ],
          spans: [{ from: 0, to: 1500, text: '全体 1,500m', tone: 'muted' }],
        },
        steps: [
          { text: '比の数をたして、全体が何つ分かを数えます。', calc: '2 + 3 = 5（5つ分）' },
          { text: '全体 1,500m を 5等分して、1つ分を出します。', calc: '1,500 ÷ 5 = 300m' },
          {
            text: 'PQ は 2つ分、QR は 3つ分です。',
            calc: 'PQ: 300 × 2 = 600m\nQR: 300 × 3 = 900m',
            figure: {
              type: 'line',
              points: [
                { at: 0, label: 'P' },
                { at: 600, label: 'Q', sub: '600m の地点' },
                { at: 1500, label: 'R' },
              ],
              spans: [
                { from: 0, to: 600, text: 'PQ 600m', tone: 'base' },
                { from: 600, to: 1500, text: 'QR 900m', tone: 'ok' },
                { from: 0, to: 1500, text: '全体 1,500m', tone: 'muted' },
              ],
            },
          },
        ],
        answer: '600m',
      },
      point: '図に比の数（2つ分・3つ分）を書き込むと、まちがえにくくなります。',
    },
    {
      title: '樹形図で数える',
      lead: '順番を決める選び方を、枝分かれの図で数える型です。',
      example: {
        stem: 'A, B, C の3人から、会長と副会長を1人ずつ選ぶ（同じ人は兼ねない）。\n選び方は全部で何通りか。',
        steps: [
          {
            text: 'まず会長を選びます。3人の誰でもよいので、枝は3本です。',
            figure: { type: 'tree', nodes: [{ label: '会長A' }, { label: '会長B' }, { label: '会長C' }] },
          },
          {
            text: '会長が決まると、副会長は残りの2人から選べます。それぞれの会長から、枝が2本ずつ出ます。',
            figure: {
              type: 'tree',
              nodes: [
                { label: '会長A', children: [{ label: '副B' }, { label: '副C' }] },
                { label: '会長B', children: [{ label: '副A' }, { label: '副C' }] },
                { label: '会長C', children: [{ label: '副A' }, { label: '副B' }] },
              ],
            },
          },
          { text: '枝先（いちばん右）の数が、選び方の数です。かけ算でも確かめられます。', calc: '3 × 2 = 6通り' },
        ],
        answer: '6通り',
      },
      point: '樹形図は、もれや重なりを防ぐために、左から順に枝を出して書きます。',
    },
    {
      title: '順位を推理する',
      lead: '条件から、順位や並び順を決めていく型です。',
      example: {
        stem: 'P, Q, R, S の4人が走り、順位をつけた。同順位はない。\n・P は 1位だった。\n・Q は R のすぐ後ろ（R の次の順位）だった。\n・S は Q より前だった。\n3位は誰か。',
        figure: {
          type: 'slots',
          rows: [
            {
              cells: [
                { head: '1位', text: '？', tone: 'muted' },
                { head: '2位', text: '？', tone: 'muted' },
                { head: '3位', text: '？', tone: 'muted' },
                { head: '4位', text: '？', tone: 'muted' },
              ],
            },
          ],
        },
        steps: [
          {
            text: '「P は 1位」を、先に枠に入れます。',
            figure: {
              type: 'slots',
              rows: [
                {
                  cells: [
                    { head: '1位', text: 'P', tone: 'ok' },
                    { head: '2位', text: '？', tone: 'muted' },
                    { head: '3位', text: '？', tone: 'muted' },
                    { head: '4位', text: '？', tone: 'muted' },
                  ],
                },
              ],
            },
          },
          {
            text: 'Q は R のすぐ後ろです。R と Q は続けて並ぶので、2位〜4位の入り方は2通りあります。',
            figure: {
              type: 'slots',
              rows: [
                {
                  label: '①',
                  cells: [
                    { head: '1位', text: 'P' },
                    { head: '2位', text: 'R' },
                    { head: '3位', text: 'Q' },
                    { head: '4位', text: 'S' },
                  ],
                },
                {
                  label: '②',
                  cells: [
                    { head: '1位', text: 'P' },
                    { head: '2位', text: 'S' },
                    { head: '3位', text: 'R' },
                    { head: '4位', text: 'Q' },
                  ],
                },
              ],
            },
          },
          {
            text: '「S は Q より前」を当てはめます。①は S が Q より後ろなので合いません。②だけが残ります。',
            figure: {
              type: 'slots',
              rows: [
                {
                  label: '①',
                  cells: [
                    { head: '1位', text: 'P' },
                    { head: '2位', text: 'R' },
                    { head: '3位', text: 'Q' },
                    { head: '4位', text: 'S', tone: 'ng' },
                  ],
                },
                {
                  label: '②',
                  cells: [
                    { head: '1位', text: 'P', tone: 'ok' },
                    { head: '2位', text: 'S', tone: 'ok' },
                    { head: '3位', text: 'R', tone: 'ok' },
                    { head: '4位', text: 'Q', tone: 'ok' },
                  ],
                },
              ],
            },
          },
          { text: '②の 3位を読みます。', calc: '1位 P ／ 2位 S ／ 3位 R ／ 4位 Q' },
        ],
        answer: 'R',
      },
      point: '決まったことから枠に入れて、「入り方が何通りか」を書き出すと整理できます。',
    },
  ],
  pitfalls: [
    {
      wrong: '4:5 に分けるとき、5,400 ÷ 4 や 5,400 ÷ 5 をしてしまう',
      right: '先に 4 + 5 = 9 で合計を出して、5,400 ÷ 9 = 600円（1つ分）を求める',
    },
    {
      wrong: '7% と 6% の食塩水を混ぜて、(7 + 6) ÷ 2 = 6.5% とする',
      right: '食塩の重さと食塩水の重さをそれぞれ合計して、33 ÷ 500 = 6.6% と求める',
    },
    {
      wrong: '400万円から 460万円への増加を、60 ÷ 460 で計算する',
      right: '「もとにする量」は昨年の 400万円。60 ÷ 400 = 0.15 → 15% と求める',
    },
  ],
}
