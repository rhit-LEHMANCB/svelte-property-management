import type { CustomThemeConfig } from '@skeletonlabs/tw-plugin';

export const myCustomTheme: CustomThemeConfig = {
	name: 'my-custom-theme',
	properties: {
		// =~= Theme Properties =~=
		'--theme-font-family-base': `system-ui`,
		'--theme-font-family-heading': `system-ui`,
		'--theme-font-color-base': '0 0 0',
		'--theme-font-color-dark': '255 255 255',
		'--theme-rounded-base': '6px',
		'--theme-rounded-container': '6px',
		'--theme-border-base': '1px',
		// =~= Theme On-X Colors =~=
		'--on-primary': '0 0 0',
		'--on-secondary': '255 255 255',
		'--on-tertiary': '255 255 255',
		'--on-success': '0 0 0',
		'--on-warning': '0 0 0',
		'--on-error': '255 255 255',
		'--on-surface': '255 255 255',
		// =~= Theme Colors  =~=
		// primary | #FFA500
		'--color-primary-50': '255 242 217', // #fff2d9
		'--color-primary-100': '255 237 204', // #ffedcc
		'--color-primary-200': '255 233 191', // #ffe9bf
		'--color-primary-300': '255 219 153', // #ffdb99
		'--color-primary-400': '255 192 77', // #ffc04d
		'--color-primary-500': '255 165 0', // #FFA500
		'--color-primary-600': '230 149 0', // #e69500
		'--color-primary-700': '191 124 0', // #bf7c00
		'--color-primary-800': '153 99 0', // #996300
		'--color-primary-900': '125 81 0', // #7d5100
		// secondary | #272729
		'--color-secondary-50': '223 223 223', // #dfdfdf
		'--color-secondary-100': '212 212 212', // #d4d4d4
		'--color-secondary-200': '201 201 202', // #c9c9ca
		'--color-secondary-300': '169 169 169', // #a9a9a9
		'--color-secondary-400': '104 104 105', // #686869
		'--color-secondary-500': '39 39 41', // #272729
		'--color-secondary-600': '35 35 37', // #232325
		'--color-secondary-700': '29 29 31', // #1d1d1f
		'--color-secondary-800': '23 23 25', // #171719
		'--color-secondary-900': '19 19 20', // #131314
		// tertiary | #272729
		'--color-tertiary-50': '223 223 223', // #dfdfdf
		'--color-tertiary-100': '212 212 212', // #d4d4d4
		'--color-tertiary-200': '201 201 202', // #c9c9ca
		'--color-tertiary-300': '169 169 169', // #a9a9a9
		'--color-tertiary-400': '104 104 105', // #686869
		'--color-tertiary-500': '39 39 41', // #272729
		'--color-tertiary-600': '35 35 37', // #232325
		'--color-tertiary-700': '29 29 31', // #1d1d1f
		'--color-tertiary-800': '23 23 25', // #171719
		'--color-tertiary-900': '19 19 20', // #131314
		// success | #5cb85c
		'--color-success-50': '231 244 231', // #e7f4e7
		'--color-success-100': '222 241 222', // #def1de
		'--color-success-200': '214 237 214', // #d6edd6
		'--color-success-300': '190 227 190', // #bee3be
		'--color-success-400': '141 205 141', // #8dcd8d
		'--color-success-500': '92 184 92', // #5cb85c
		'--color-success-600': '83 166 83', // #53a653
		'--color-success-700': '69 138 69', // #458a45
		'--color-success-800': '55 110 55', // #376e37
		'--color-success-900': '45 90 45', // #2d5a2d
		// warning | #EAB308
		'--color-warning-50': '252 244 218', // #fcf4da
		'--color-warning-100': '251 240 206', // #fbf0ce
		'--color-warning-200': '250 236 193', // #faecc1
		'--color-warning-300': '247 225 156', // #f7e19c
		'--color-warning-400': '240 202 82', // #f0ca52
		'--color-warning-500': '234 179 8', // #EAB308
		'--color-warning-600': '211 161 7', // #d3a107
		'--color-warning-700': '176 134 6', // #b08606
		'--color-warning-800': '140 107 5', // #8c6b05
		'--color-warning-900': '115 88 4', // #735804
		// error | #7f1d1c
		'--color-error-50': '236 221 221', // #ecdddd
		'--color-error-100': '229 210 210', // #e5d2d2
		'--color-error-200': '223 199 198', // #dfc7c6
		'--color-error-300': '204 165 164', // #cca5a4
		'--color-error-400': '165 97 96', // #a56160
		'--color-error-500': '127 29 28', // #7f1d1c
		'--color-error-600': '114 26 25', // #721a19
		'--color-error-700': '95 22 21', // #5f1615
		'--color-error-800': '76 17 17', // #4c1111
		'--color-error-900': '62 14 14', // #3e0e0e
		// surface | #09090b
		'--color-surface-50': '218 218 218', // #dadada
		'--color-surface-100': '206 206 206', // #cecece
		'--color-surface-200': '194 194 194', // #c2c2c2
		'--color-surface-300': '157 157 157', // #9d9d9d
		'--color-surface-400': '83 83 84', // #535354
		'--color-surface-500': '9 9 11', // #09090b
		'--color-surface-600': '8 8 10', // #08080a
		'--color-surface-700': '7 7 8', // #070708
		'--color-surface-800': '5 5 7', // #050507
		'--color-surface-900': '4 4 5' // #040405
	},
	properties_dark: {}
};
