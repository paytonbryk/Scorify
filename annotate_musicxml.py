"""Add timed harmonic-analysis directions without changing score notes or playback."""
from collections import Counter, defaultdict
from fractions import Fraction
import math
import xml.etree.ElementTree as ET


def normalize_analysis_divisions(source, destination):
    """Use one integer ticks-per-quarter scale across all parts for AnalysisGNN.

    Its graph builder compares the merged note array against one part's raw
    measure ticks. Mixed divisions are valid MusicXML, but break that comparison.
    This operates on an analysis-only copy, never the uploaded/exported score.
    """
    tree = ET.parse(source)
    root = tree.getroot()
    namespace = root.tag.split('}')[0][1:] if root.tag.startswith('{') else ''
    tag = lambda name: f'{{{namespace}}}{name}' if namespace else name
    if root.tag != tag('score-partwise'):
        raise ValueError('Analysis requires partwise MusicXML.')
    changes, values, division_nodes = [], [], []
    for part in root.findall(tag('part')):
        divisions = Fraction(1)
        for measure in part.findall(tag('measure')):
            for child in measure:
                if child.tag == tag('attributes'):
                    node = child.find(tag('divisions'))
                    if node is not None:
                        divisions = Fraction(node.text)
                        if divisions <= 0:
                            raise ValueError('MusicXML divisions must be positive.')
                        values.append(divisions)
                        division_nodes.append(node)
                for node in child.iter():
                    if node.tag in (tag('duration'), tag('offset')):
                        changes.append((node, None, Fraction(node.text) / divisions))
                    if node.tag == tag('note'):
                        for attribute in ('attack', 'release'):
                            if attribute in node.attrib:
                                changes.append((node, attribute, Fraction(node.get(attribute)) / divisions))
                    if node.tag == tag('grace') and 'make-time' in node.attrib:
                        changes.append((node, 'make-time', Fraction(node.get('make-time')) / divisions))
    target = 1
    # Include all original scales and fractional durations to avoid rounding.
    for factor in [value.numerator for value in values] + [value.denominator for _, _, value in changes]:
        target = target * factor // math.gcd(target, factor)
    for node in division_nodes:
        node.text = str(target)
    for node, attribute, quarters in changes:
        ticks = quarters * target
        if ticks.denominator != 1:
            raise ValueError('Cannot normalize fractional MusicXML timing exactly.')
        if attribute:
            node.set(attribute, str(ticks.numerator))
        else:
            node.text = str(ticks.numerator)
    # Explicitly establish the common scale even for parts without divisions.
    for part in root.findall(tag('part')):
        measure = part.find(tag('measure'))
        if measure is None:
            continue
        attributes = ET.Element(tag('attributes'))
        ET.SubElement(attributes, tag('divisions')).text = str(target)
        measure.insert(0, attributes)
    if namespace:
        ET.register_namespace('', namespace)
    tree.write(destination, encoding='utf-8', xml_declaration=True)
    return target


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
