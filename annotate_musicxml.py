"""Add timed harmonic-analysis directions without changing score notes or playback."""
from collections import Counter, defaultdict
from fractions import Fraction
import math
import xml.etree.ElementTree as ET


def annotate_musicxml(source, destination, events):
    """Events have measure_index, offset_quarter, romanNumeral and localkey.

    Coordinates are written-score positions, not unfolded repeat positions.
    All annotations go on staff 1 of the first part. Simultaneous predictions
    vote for a label; consecutive identical labels within a measure collapse.
    """
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True))
    tree = ET.parse(source, parser=parser)
    root = tree.getroot()
    namespace = root.tag.split('}')[0][1:] if root.tag.startswith('{') else ''
    if namespace:
        ET.register_namespace('', namespace)
    tag = lambda name: f'{{{namespace}}}{name}' if namespace else name
    if root.tag != tag('score-partwise'):
        raise ValueError('Annotation export requires partwise MusicXML.')
    parts = root.findall(tag('part'))
    if not parts:
        raise ValueError('The score has no parts.')
    measures = parts[0].findall(tag('measure'))
    # Replace only our own annotations, retaining original text and chord symbols.
    for part in parts:
        for measure in part.findall(tag('measure')):
            for direction in list(measure.findall(tag('direction'))):
                if direction.get('id', '').startswith('scorify-analysis-'):
                    measure.remove(direction)

    votes = defaultdict(Counter)
    for event in events:
        index = int(event['measure_index'])
        offset = float(event['offset_quarter'])
        if index < 0 or index >= len(measures) or not math.isfinite(offset) or offset < -1e-6:
            raise ValueError('Analysis contains a position outside the score.')
        rn = str(event.get('romanNumeral', '')).strip()
        key = str(event.get('localkey', '')).strip()
        if rn.lower() in ('', '?', 'nan', 'none'):
            continue
        label = f'{key}: {rn}' if key.lower() not in ('', '?', 'nan', 'none') else rn
        votes[(index, round(max(0, offset), 6))][label] += 1

    positions = defaultdict(list)
    for (index, offset), labels in sorted(votes.items()):
        label = sorted(labels, key=lambda value: (-labels[value], value))[0]
        if positions[index] and positions[index][-1][1] == label:
            continue
        positions[index].append((offset, label))

    divisions = Fraction(1)
    count = 0
    for index, measure in enumerate(measures):
        # Initial directions may precede attributes. Read all divisions changes
        # before the first timed event, then insert while the cursor is still 0.
        insertion = 0
        for child in measure:
            if child.tag in (tag('note'), tag('backup'), tag('forward')):
                break
            if child.tag == tag('attributes'):
                value = child.findtext(tag('divisions'))
                if value is not None:
                    divisions = Fraction(value)
            insertion += 1
        if divisions <= 0:
            raise ValueError('MusicXML divisions must be positive.')
        for offset, label in positions[index]:
            count += 1
            direction = ET.Element(tag('direction'), {
                'id': f'scorify-analysis-{count}', 'placement': 'above',
            })
            dtype = ET.SubElement(direction, tag('direction-type'))
            ET.SubElement(dtype, tag('words'), {
                'font-size': '10', 'font-weight': 'bold', 'color': '#8B3A0F',
            }).text = label
            ET.SubElement(direction, tag('offset'), {'sound': 'no'}).text = format(float(Fraction(str(offset)) * divisions), '.10g')
            ET.SubElement(direction, tag('staff')).text = '1'
            measure.insert(insertion, direction)
            insertion += 1
        # Divisions changes later in the measure carry into the next measure.
        for attributes in measure.findall(tag('attributes')):
            value = attributes.findtext(tag('divisions'))
            if value is not None:
                divisions = Fraction(value)
    if not count:
        raise ValueError('The model returned no harmonic labels to export.')
    tree.write(destination, encoding='utf-8', xml_declaration=True)
    return count
