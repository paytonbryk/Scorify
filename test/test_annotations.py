import tempfile
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET
from annotate_musicxml import annotate_musicxml, normalize_analysis_divisions

XML = '''<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part><score-part id="P2"><part-name>Bass</part-name></score-part></part-list><part id="P1"><measure number="0" implicit="yes"><attributes><divisions>24</divisions></attributes><direction><direction-type><words>Original text</words></direction-type></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>24</duration></note></measure><measure number="7"><attributes><divisions>12</divisions></attributes><note><pitch><step>D</step><octave>4</octave></pitch><duration>48</duration></note><barline><repeat direction="backward"/></barline></measure></part><part id="P2"><measure number="0"><note><rest/><duration>24</duration></note></measure><measure number="7"><note><rest/><duration>96</duration></note></measure></part></score-partwise>'''

class AnnotationTests(unittest.TestCase):
    def test_normalize_mixed_divisions_and_mid_score_change(self):
        xml = '''<score-partwise><part id="P1"><measure number="0" implicit="yes"><attributes><divisions>4</divisions></attributes><note><duration>4</duration></note></measure><measure number="1"><note attack="-1" release="1"><duration>8</duration></note><backup><duration>8</duration></backup><note><duration>4</duration></note><forward><duration>4</duration></forward><direction><offset>-2</offset></direction></measure></part><part id="P2"><measure number="0" implicit="yes"><attributes><divisions>1</divisions></attributes><note><duration>1</duration></note></measure><measure number="1"><attributes><divisions>2</divisions></attributes><note><duration>4</duration></note></measure></part></score-partwise>'''
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory)/'in.xml', Path(directory)/'out.xml'
            source.write_text(xml)
            self.assertEqual(normalize_analysis_divisions(source, output), 4)
            doc = ET.parse(output)
            self.assertEqual({d.text for d in doc.findall('.//divisions')}, {'4'})
            self.assertEqual([n.findtext('duration') for n in doc.findall('.//part[@id="P2"]//note')], ['4', '8'])
            self.assertEqual(doc.findtext('.//backup/duration'), '8')
            self.assertEqual(doc.findtext('.//forward/duration'), '4')
            self.assertEqual(doc.findtext('.//offset'), '-2')
            self.assertEqual(doc.find('.//note[@attack]').get('attack'), '-1')
            self.assertEqual(source.read_text(), xml)
            self.assertEqual(doc.find('.//measure').get('number'), '0')
            self.assertEqual(doc.find('.//measure').get('implicit'), 'yes')

    def test_normalize_fractional_timing_without_rounding(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory)/'in.xml', Path(directory)/'out.xml'
            source.write_text('<score-partwise><part id="P1"><measure><attributes><divisions>2</divisions></attributes><note><duration>0.5</duration></note></measure></part></score-partwise>')
            self.assertEqual(normalize_analysis_divisions(source, output), 4)
            self.assertEqual(ET.parse(output).findtext('.//note/duration'), '1')

    def test_timing_top_staff_preservation_and_reanalysis(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory)/'in.xml', Path(directory)/'out.xml'
            source.write_text(XML)
            events = [dict(measure_index=0, offset_quarter=0, romanNumeral='I', localkey='C')]
            # Keep a returning I after V, but collapse repeated adjacent I predictions.
            for offset, label in [(0, 'I'), (1, 'I'), (2, 'V7'), (3, 'I')]:
                events.append(dict(measure_index=1, offset_quarter=offset, romanNumeral=label, localkey='C'))
            self.assertEqual(annotate_musicxml(source, output, events), 4)
            doc = ET.parse(output)
            parts = doc.findall('part')
            annotations = [d for d in parts[0].findall('.//direction') if d.get('id')]
            self.assertEqual([d.findtext('offset') for d in annotations], ['0', '0', '24', '36'])
            self.assertTrue(all(d.get('placement') == 'above' and d.findtext('staff') == '1' for d in annotations))
            self.assertEqual(len(parts[1].findall('.//direction')), 0)
            self.assertIn('Original text', [w.text for w in doc.findall('.//words')])
            self.assertEqual([ET.tostring(n) for n in doc.findall('.//note')], [ET.tostring(n) for n in ET.fromstring(XML).findall('.//note')])
            self.assertIsNotNone(doc.find('.//repeat'))
            self.assertEqual(annotate_musicxml(output, output, events), 4)
            self.assertEqual(len([d for d in ET.parse(output).findall('.//direction') if d.get('id')]), 4)

    def test_namespace_and_vote(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory)/'in.xml', Path(directory)/'out.xml'
            source.write_text(XML.replace('<score-partwise>', '<score-partwise xmlns="http://www.musicxml.org/ns/musicxml">'))
            events = [dict(measure_index=0, offset_quarter=0, romanNumeral=rn) for rn in ['V', 'I', 'I']]
            annotate_musicxml(source, output, events)
            self.assertEqual(ET.parse(output).findtext('.//{*}direction[@id]/{*}direction-type/{*}words'), 'I')

if __name__ == '__main__':
    unittest.main()
