import * as dfns from 'date-fns';
import Excel from 'exceljs';
import * as cheerio from 'cheerio';

type UnparsedValue = {
    value: string;
    isBold: boolean;
};

type Row = {
    discountCategory: string;
    priceCategory: string;
    row: Record<string, number>;
};

type Event = {
    id: number;
    date: Date;
    eventName: string;
    locationId: string;
    location: string;
    address: string;
    rows: Row[];
};

const isInt = (current: UnparsedValue) =>
    /^(- )?\d{1,3}(\.\d{3})*$/.test(current.value) && !current.isBold;

const isFloat = (current: UnparsedValue) =>
    /^(- )?\d{1,3}(\.\d{3})*,\d{2}$/.test(current.value) && !current.isBold;

const _parseFloat = (s: string) =>
    parseFloat(s.replace(/\./, '').replace(/,/, '.').replace(/\s/g, ''));

const _parseInt = (s: string) =>
    parseInt(s.replace(/\./, '').replace(/\s/g, ''), 10);

const isRowHeader = (current: UnparsedValue) =>
    !current.isBold &&
    /^(?!\d{1,3}(\.\d{3})*,\d{2}$)(?!\d+$)[\d\w\s():]+$/.test(current.value);

export const fromEventimReport = (html: string) => {
    const $ = cheerio.load(html);

    const unparsed: UnparsedValue[] = [];

    $('table')
        .find('font')
        .each(function () {
            const element = $(this);
            const _ = element.clone();
            const isBold = $(_).children().get(0)?.tagName === 'strong';
            _.find('br').replaceWith('\n');
            const value = _.text().trim();
            const unparsedValue: UnparsedValue = {value, isBold};
            unparsed.push(unparsedValue);
        });

    const eventRegex =
        /^(?<eventName>.*)\n(?<locationId>\d+) \/ (?<location>.*)\n(?<address>.*)$/;

    const ignore = new RegExp(
        `^${[
            'Allgemeiner Verkaufsbericht',
            'Gedruckt am: .*',
            'Veranstaltung\nVeranstaltungsstätte: Nr / Name\n.*',
            'Zeitraum: .*',
            'inkl. Stornos',
            'Alle Preise in EUR',
            'VA Nr.',
            'Datum',
            'Gesamt',
            'Rabatt',
            'Einzel Endpreis',
            'Anzahl Tickets',
            // version number, i think?
            '\\d\\.\\d\\.\\d\\.\\d',
        ].join('|')}$`,
    );

    const events = [];
    let currentEvent: Partial<Event> = {rows: []};

    let i = 0;
    const defaultFeeNames = [
        'Einzel Endpreis',
        'Anzahl Tickets',
        'Grundpreis',
        'VVK-Gebühr',
        'Sys-Geb.',
    ];
    let currentFeeNames = new Set<string>();
    const allFeeNames = new Set<string>(defaultFeeNames);
    let discountCategory = undefined;
    let priceCategory = undefined;
    while (i < unparsed.length) {
        const current = unparsed[i];

        // useless
        if (ignore.test(current.value)) {
            i++;
            continue;
        }

        // price category headers
        if (current.value === 'Preiskategorie') {
            // currentFeeNames = new Set();
            do {
                i++;
                // currentFeeNames.add(unparsed[i].value);
                // allFeeNames.add(unparsed[i].value);
            } while (unparsed[i + 1]?.value !== 'Endpreis');
            i++;
            continue;
        }

        // event name
        if (
            current.isBold &&
            /^\d+$/.test(current.value) &&
            /\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}/.test(unparsed[i + 1].value)
        ) {
            if (currentEvent.id !== undefined) {
                events.push(currentEvent);
                currentEvent = {rows: []};
            }
            const id = parseInt(current.value, 10);
            const date = dfns.parse(
                unparsed[i + 1].value,
                'dd.MM.yy HH:mm',
                new Date(),
            );

            const next2 = unparsed[i + 2];
            const event = eventRegex.exec(next2.value)?.groups;
            currentEvent = {...currentEvent, id, date, ...event};

            i = i + 3;

            currentFeeNames = new Set(defaultFeeNames);
            while (unparsed[i].isBold) {
                currentFeeNames.add(unparsed[i].value);
                allFeeNames.add(unparsed[i].value);
                i++;
            }
            continue;
        }

        // table values
        if (isFloat(current)) {
            // row value
            // console.log({number: current.value});
        } else if (isInt(current)) {
            // ticket number
            // console.log({int: current.value});
            // currentEvent.values?.push({
            //     key: (discountCategory || '') + (priceCategory || ''),
            //     tickets: parseInt(current.value),
            // });
        } else if (current.isBold) {
            // if (current.value !== 'Endpreis') {
            // currentFeeNames.add(current.value);
            // allFeeNames.add(current.value);
            // }
        } else {
            if (unparsed[i + 1] !== undefined) {
                // 1. start price group
                // [text] [text]
                if (isRowHeader(unparsed[i + 1])) {
                    discountCategory = current.value;
                    // if (currentEvent?.eventName?.startsWith('GIANNA')) {
                    //     console.log({
                    //         discountCategory,
                    //         n1: unparsed[i + 1],
                    //     });
                    // }
                    // console.log({prefix: prefix});
                }
                // 2. row in price group
                // [text] [float] [int]
                else if (isFloat(unparsed[i + 1]) && isInt(unparsed[i + 2])) {
                    priceCategory = current.value;
                    // if (currentEvent?.eventName?.startsWith('GIANNA')) {
                    //     console.log({
                    //         discountCategory,
                    //         priceCategory,
                    //         n1: unparsed[i + 1],
                    //     });
                    // }
                    const parsedValues: number[] = [];
                    while (
                        unparsed[i + 1] !== undefined &&
                        (isFloat(unparsed[i + 1]) || isInt(unparsed[i + 1]))
                    ) {
                        const raw = unparsed[i + 1];
                        const parsed = isFloat(raw)
                            ? _parseFloat(raw.value)
                            : _parseInt(raw.value);
                        parsedValues.push(parsed);
                        i++;
                    }
                    const row = [...currentFeeNames.values()].reduce(
                        (m, s, i) => ({...m, [s]: parsedValues[i]}),
                        {},
                    );
                    currentEvent.rows?.push({
                        discountCategory: discountCategory as string,
                        priceCategory,
                        row,
                    });
                    continue;
                    // console.log({
                    //     currentPriceCategory: category,
                    //     prefix: prefix,
                    // });
                }
                // 3. end price group (sum)
                // [text] [int]
                else if (isInt(unparsed[i + 1])) {
                    priceCategory = undefined;
                    // console.log({
                    //     prefix: prefix,
                    //     currentPriceCategory: category,
                    // });
                }
                // 4. total sum
                // [summe] [int]
                else if (/^Summe Veranstaltung.*/.test(current.value)) {
                    // discountCategory = 'sum';
                    // priceCategory = undefined;
                } else {
                    // console.log(current);
                }
                // console.log({rowHeader: current.value});
            }
        }
        i++;
    }

    if (currentEvent !== undefined) {
        events.push(currentEvent);
    }

    return {events: events as Event[], allFeeNames: new Array(...allFeeNames)};
};

export const writeWorkbook = async ({
    events,
    allFeeNames,
}: {
    events: Event[];
    allFeeNames: string[];
}) => {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('events');
    worksheet.columns = [
        'VANr',
        'Datum',
        'Veranstaltung',
        'VeranstaltungsstätteNr',
        'VeranstaltungsstätteName',
        'VeranstaltungsstätteAdresse',
        'Rabatt',
        'PK',
        ...allFeeNames,
    ].map(keyOrColumn => ({key: keyOrColumn, header: keyOrColumn}));
    worksheet.views = [{state: 'frozen', ySplit: 1}];

    events
        .flatMap(({id, date, eventName, locationId, location, address, rows}) =>
            rows.map(({discountCategory, priceCategory, row}) => ({
                VANr: id,
                Datum: date,
                Veranstaltung: eventName,
                VeranstaltungsstätteNr: parseInt(locationId, 10),
                VeranstaltungsstätteName: location,
                VeranstaltungsstätteAdresse: address,
                Rabatt: discountCategory,
                PK: priceCategory,
                ...allFeeNames.reduce(
                    (m, key) => ({...m, [key]: row[key] || 0}),
                    {},
                ),
            })),
        )
        .forEach(row => {
            worksheet.addRow(row);
        });
    return await workbook.xlsx.writeBuffer();
};

// readLocalReport.pipe(
//     Effect.map(fromEventimReport),
//     // Effect.tap(({events}) =>
//     //     console.log(JSON.stringify(events.slice(2, 3), null, 2)),
//     // ),
//     Effect.flatMap(r => Effect.promise(() => writeWorkbook(r))),
//     Effect.tap(() => Effect.log('done')),
//     Effect.provide(NodeContext.layer),
//     Effect.runPromise,
// );
