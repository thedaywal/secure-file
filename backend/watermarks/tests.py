from io import BytesIO

from django.test import SimpleTestCase
from PIL import Image

from watermarks.generator import _load_font, render_watermarked


class WatermarkGeneratorTests(SimpleTestCase):
    def setUp(self):
        image = Image.new('RGB', (1600, 900), 'white')
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        self.original = buffer.getvalue()

    @staticmethod
    def dark_pixel_count(payload: bytes, threshold: int = 128) -> int:
        image = Image.open(BytesIO(payload)).convert('L')
        return sum(1 for pixel in image.getdata() if pixel < threshold)

    def test_font_is_bold_and_respects_requested_size(self):
        small_font = _load_font(14)
        large_font = _load_font(40)
        small_height = small_font.getbbox('2001110001')[3] - small_font.getbbox('2001110001')[1]
        large_height = large_font.getbbox('2001110001')[3] - large_font.getbbox('2001110001')[1]

        self.assertIn('bold', small_font.getname()[1].lower())
        self.assertGreater(large_height, small_height)

    def test_opacity_setting_changes_rendered_ink(self):
        faint = render_watermarked(self.original, ['2001110001'], opacity=0.2, size=1.0)
        strong = render_watermarked(self.original, ['2001110001'], opacity=0.9, size=1.0)

        self.assertGreater(self.dark_pixel_count(strong), self.dark_pixel_count(faint))
        self.assertEqual(self.dark_pixel_count(faint), 0)

    def test_size_setting_changes_rendered_ink_coverage(self):
        small = render_watermarked(self.original, ['2001110001'], opacity=0.9, size=0.5)
        large = render_watermarked(self.original, ['2001110001'], opacity=0.9, size=2.0)

        self.assertGreater(self.dark_pixel_count(large, threshold=180), self.dark_pixel_count(small, threshold=180))
